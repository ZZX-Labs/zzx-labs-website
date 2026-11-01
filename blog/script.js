/* ZZX-BLOG v5: ONE shared browser script for /blog/, /blog/journal/,
   /blog/blog-posts/, /blog/blog-posts/YYYY-MM-.../, /blog/rss/ and posts.
   Works on GitHub Pages; no node, React, npm, Flask, or external runtime.
   Initial HTML includes all entries for non-JS fallback. */
(() => {
  'use strict';
  const root = document.body;
  if (!root || !root.classList.contains('zzx-blog')) return;
  const view = root.dataset.blogView || 'home';
  const search = document.getElementById('search');
  if (!search) return;  // Article pages need only shared CSS and site chrome.
  const category = document.getElementById('category-filter');
  const tag = document.getElementById('tag-filter');
  const sort = document.getElementById('sort-order');
  const shuffle = document.getElementById('shuffle');
  const status = document.getElementById('blog-status');
  const count = document.getElementById('post-count');
  let all = [];
  let shuffled = false;
  let shuffledOrder = [];
  const elt = (name, cls, text) => {
    const node = document.createElement(name);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const clear = node => { if (node) node.replaceChildren(); };
  const dateValue = p => Number.isFinite(Date.parse(p.date)) ? Date.parse(p.date) : 0;
  const day = p => (p.date || '').slice(0, 10);
  const normalize = raw => ({
    title: String(raw.title || 'Untitled'), url: String(raw.url || ''),
    description: String(raw.description || ''), date: String(raw.date || ''),
    category: String(raw.category || 'Research'),
    thumb: String(raw.thumb || ''), hero_alt: String(raw.hero_alt || raw.title || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    status: String(raw.status || '')
  });
  function imageBlock(post) {
    const a = elt('a', 'blog-card-art');
    a.href = post.url;
    if (post.thumb.startsWith('/assets/hero/') && post.thumb.endsWith('.png')) {
      const img = elt('img');
      img.src = post.thumb;
      img.alt = post.hero_alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => { img.hidden = true; a.classList.add('image-unavailable'); }, {once:true});
      a.append(img);
    } else a.classList.add('image-unavailable');
    return a;
  }
  function card(post) {
    const item = elt('article', 'blog-card');
    item.dataset.url = post.url;
    const body = elt('div', 'blog-card-body');
    const meta = elt('div', 'blog-meta');
    meta.append(elt('span','',post.category), elt('span','',`${day(post)} (archive date)`));
    const h = elt('h3'); const link = elt('a','',post.title); link.href = post.url; h.append(link);
    body.append(meta, h, elt('p','',post.description));
    if (post.status === 'source-missing') body.append(elt('span','archive-flag','Source text unavailable'));
    const tags = elt('div', 'blog-tags');
    post.tags.slice(0,4).forEach(x => tags.append(elt('span','blog-tag',x)));
    const read = elt('a','blog-read','Read article'); read.href = post.url;
    body.append(tags,read);
    item.append(imageBlock(post),body);
    return item;
  }
  function optionsFor(select, values, name) {
    if (!select) return;
    const current = select.value;
    clear(select);
    const first = elt('option','',`All ${name}`); first.value = ''; select.append(first);
    [...new Set(values)].filter(Boolean).sort((a,b) => a.localeCompare(b)).forEach(value => {
      const option = elt('option','',value); option.value = value; select.append(option);
    });
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }
  function shuffleArray(xs) {
    for (let i = xs.length-1; i>0; i--) {
      const j = Math.floor(Math.random() * (i+1));
      [xs[i],xs[j]] = [xs[j],xs[i]];
    }
    return xs;
  }
  function filtered() {
    const query = search.value.trim().toLocaleLowerCase();
    let posts = all.filter(p => {
      if (view === 'month' && !p.date.startsWith(root.dataset.blogMonth || '')) return false;
      if (category.value && category.value !== p.category) return false;
      if (tag.value && !p.tags.includes(tag.value)) return false;
      return !query || [p.title,p.description,p.category,...p.tags].join(' ').toLocaleLowerCase().includes(query);
    });
    if (shuffled) {
      const ranks = new Map(shuffledOrder.map((key,i) => [key,i]));
      posts.sort((a,b) => (ranks.get(a.url) ?? 1e9)-(ranks.get(b.url) ?? 1e9));
    } else if (sort.value === 'title') posts.sort((a,b) => a.title.localeCompare(b.title));
    else posts.sort((a,b) => sort.value === 'oldest' ? dateValue(a)-dateValue(b) : dateValue(b)-dateValue(a));
    return posts;
  }
  function showCards(target, posts) {
    if (!target) return;
    clear(target);
    const fragment = document.createDocumentFragment();
    posts.forEach(p => fragment.append(card(p)));
    target.append(fragment);
  }
  function archive(target, posts) {
    if (!target) return;
    clear(target);
    const groups = new Map();
    posts.forEach(p => {
      const key = p.date.slice(0,7) || 'Undated';
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(p);
    });
    for (const [month, entries] of groups) {
      const section = elt('section','month-group');
      const heading = elt('div','blog-section-head');
      let label = month;
      if (/^\d{4}-\d{2}$/.test(month)) {
        const dt = new Date(month+'-01T00:00:00Z');
        if (!Number.isNaN(+dt)) label = dt.toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'});
      }
      heading.append(elt('h2','',label), elt('p','',`${entries.length} entries`));
      const grid = elt('div','blog-grid'); entries.forEach(p => grid.append(card(p)));
      section.append(heading,grid); target.append(section);
    }
  }
  function render() {
    const posts = filtered();
    if (count) count.textContent = String(all.length);
    if (status) status.textContent = `Showing ${posts.length} of ${view === 'month' ? all.filter(p=>p.date.startsWith(root.dataset.blogMonth||'')).length : all.length} articles`;
    if (view === 'home' || view === 'journal') {
      const feat = document.getElementById('featured-list');
      const recent = document.getElementById('recent-list');
      showCards(feat,posts.slice(0,4)); showCards(recent,posts.slice(4));
    } else if (view === 'archive') archive(document.getElementById('archives'),posts);
    else if (view === 'rss') showCards(document.getElementById('rss-previews'),posts);
    else if (view === 'month') showCards(document.getElementById('month-posts'),posts);
    if (!posts.length) {
      const dest = document.getElementById(view === 'archive' ? 'archives' : view === 'rss' ? 'rss-previews' : view === 'month' ? 'month-posts' : 'recent-list');
      if (dest) dest.append(elt('p','empty-message','No articles match these filters.'));
    }
  }
  async function init() {
    let data;
    try {
      const response = await fetch('/blog/catalog.json', {cache:'no-cache'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      if (!data || !Array.isArray(data.posts)) throw new Error('Invalid catalog schema');
    } catch (err) {
      // Static HTML has all posts pre-rendered; never erase them on fetch failure.
      if (status) status.textContent = 'Showing the static article index (live filtering unavailable).';
      console.warn('ZZX Blog: catalog unavailable; static posts retained.',err);
      return;
    }
    const urls = new Set(); const thumbs = new Set();
    all = data.posts.map(normalize).filter(p => {
      if (!p.url.startsWith('/blog/blog-posts/') || urls.has(p.url)) return false;
      urls.add(p.url);
      if (p.thumb && thumbs.has(p.thumb)) console.warn('Duplicate artwork assigned:',p.thumb);
      thumbs.add(p.thumb);
      return true;
    });
    optionsFor(category,all.map(p=>p.category),'categories');
    optionsFor(tag,all.flatMap(p=>p.tags),'topics');
    [search,category,tag,sort].forEach(control => {
      if (control) control.addEventListener(control === search ? 'input' : 'change', () => {shuffled=false;render();});
    });
    if (shuffle) shuffle.addEventListener('click', () => {
      shuffled = true;
      shuffledOrder = shuffleArray(all.map(p=>p.url));
      render();
    });
    render();
  }
  init();
})();
