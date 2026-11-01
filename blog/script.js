/* ZZX-LABS R&D | ZZX-BLOG shared browser renderer v6.8
 * Covers /blog/, /blog/journal/, /blog/blog-posts/, monthly archives, /blog/rss/.
 * Article pages have no listing controls and are left unchanged.
 * Pure browser JavaScript; no dependencies, build step, or server-side runtime.
 * Pre-rendered HTML is retained if fetching /blog/catalog.json fails.
 * Catalog artwork is authoritative; this renderer never reassigns images.
 */
(() => {
  'use strict';

  function boot() {
    const root = document.body;
    if (!root || !root.classList.contains('zzx-blog')) return;

    const view = root.dataset.blogView || 'home';
    const containers = {
      featured: document.getElementById('featured-list'),
      recent: document.getElementById('recent-list'),
      archive: document.getElementById('archives'),
      rss: document.getElementById('rss-previews'),
      month: document.getElementById('month-posts')
    };
    const search = document.getElementById('search');
    const category = document.getElementById('category-filter');
    const tag = document.getElementById('tag-filter');
    const sort = document.getElementById('sort-order');
    const shuffle = document.getElementById('shuffle');
    const publication = document.getElementById('publication-status');
    const status = document.getElementById('blog-status');
    const count = document.getElementById('post-count');

    // The shared site script handles the global header, ticker, and footer.
    // Do not mutate article pages or a legacy page with different containers.
    const destination = view === 'archive' ? containers.archive
      : view === 'rss' ? containers.rss
      : view === 'month' ? containers.month : containers.recent;
    if (!search || !destination) return;

    const monthKey = /^\d{4}-\d{2}$/.test(root.dataset.blogMonth || '')
      ? root.dataset.blogMonth : '';
    let records = [];
    let randomRanks = null;

    const make = (tagName, className = '', text) => {
      const node = document.createElement(tagName);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = String(text);
      return node;
    };
    const clean = element => { if (element) element.replaceChildren(); };
    const dateMs = post => {
      const number = Date.parse(post.date);
      return Number.isFinite(number) ? number : -Infinity;
    };
    const displayDate = post => /^\d{4}-\d{2}-\d{2}/.test(post.date)
      ? post.date.substring(0, 10) : 'Undated';
    const validArticleURL = value => typeof value === 'string' &&
      /^\/blog\/blog-posts\/\d{4}-\d{2}-[a-z]+\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(value);
    const validImageURL = value => typeof value === 'string' &&
      /^\/assets\/hero\/[a-z0-9][a-z0-9_-]*\.png$/.test(value);

    function normalize(raw) {
      if (!raw || typeof raw !== 'object' || !validArticleURL(raw.url)) return null;
      const tags = Array.isArray(raw.tags) ? raw.tags.filter(x => typeof x === 'string') : [];
      const editorialStatus = typeof raw.status === 'string' ? raw.status : '';
      const isPublished = editorialStatus === 'published' ||
        (!editorialStatus && raw.published === true);
      return {
        url: raw.url,
        title: String(raw.title || 'Untitled'),
        description: String(raw.description || ''),
        date: typeof raw.date === 'string' ? raw.date : '',
        category: String(raw.category || 'Research'),
        tags,
        thumb: validImageURL(raw.thumb) ? raw.thumb : '',
        heroAlt: String(raw.hero_alt || raw.title || 'ZZX-Labs editorial artwork'),
        status: editorialStatus,
        published: isPublished
      };
    }

    function imageBlock(post) {
      const link = make('a', 'blog-card-art');
      link.href = post.url;
      if (!post.thumb) {
        link.classList.add('image-unavailable');
        return link;
      }
      const image = make('img');
      image.src = post.thumb;
      image.alt = post.heroAlt;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => {
        image.hidden = true;
        link.classList.add('image-unavailable');
      }, {once: true});
      link.append(image);
      return link;
    }

    function card(post) {
      const article = make('article', 'blog-card');
      article.dataset.url = post.url;
      const body = make('div', 'blog-card-body');
      const meta = make('div', 'blog-meta');
      meta.append(
        make('span', '', post.category),
        make('span', '', `${displayDate(post)} (${post.published ? 'published' : 'archive date'})`)
      );
      const heading = make('h3');
      const titleLink = make('a', '', post.title);
      titleLink.href = post.url;
      heading.append(titleLink);
      body.append(meta, heading, make('p', '', post.description));
      if (post.status === 'source-missing') {
        body.append(make('span', 'archive-flag', 'Original source text unavailable'));
      }
      const tagBox = make('div', 'blog-tags');
      post.tags.slice(0, 4).forEach(value => tagBox.append(make('span', 'blog-tag', value)));
      const read = make('a', 'blog-read', 'Read article');
      read.href = post.url;
      body.append(tagBox, read);
      article.append(imageBlock(post), body);
      return article;
    }

    function populateSelect(select, values, title) {
      if (!select) return;
      const prior = select.value;
      const empty = make('option', '', `All ${title}`);
      empty.value = '';
      select.replaceChildren(empty);
      const distinct = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
      for (const value of distinct) {
        const option = make('option', '', value);
        option.value = value;
        select.append(option);
      }
      if (distinct.includes(prior)) select.value = prior;
    }

    function monthScope() {
      if (view !== 'month' || !monthKey) return records;
      return records.filter(post => post.date.startsWith(monthKey));
    }

    function selectRecords() {
      const query = search.value.trim().toLocaleLowerCase();
      const categoryValue = category ? category.value : '';
      const tagValue = tag ? tag.value : '';
      const publicationValue = publication ? publication.value : 'all';
      const selected = monthScope().filter(post => {
        if (categoryValue && post.category !== categoryValue) return false;
        if (tagValue && !post.tags.includes(tagValue)) return false;
        if (publicationValue === 'published' && !post.published) return false;
        if (publicationValue === 'pending' && post.published) return false;
        if (!query) return true;
        return [post.title, post.description, post.category, ...post.tags]
          .join(' ').toLocaleLowerCase().includes(query);
      });

      if (randomRanks) {
        selected.sort((a, b) => (randomRanks.get(a.url) ?? Infinity) -
          (randomRanks.get(b.url) ?? Infinity));
      } else if (sort && sort.value === 'title') {
        selected.sort((a, b) => a.title.localeCompare(b.title));
      } else if (sort && sort.value === 'oldest') {
        selected.sort((a, b) => dateMs(a) - dateMs(b) || a.title.localeCompare(b.title));
      } else {
        selected.sort((a, b) => dateMs(b) - dateMs(a) || a.title.localeCompare(b.title));
      }
      return selected;
    }

    function fillCards(element, posts) {
      if (!element) return;
      const fragment = document.createDocumentFragment();
      posts.forEach(post => fragment.append(card(post)));
      element.replaceChildren(fragment);
    }

    function fillArchive(element, posts) {
      if (!element) return;
      const groups = new Map();
      posts.forEach(post => {
        const month = /^\d{4}-\d{2}/.test(post.date) ? post.date.slice(0, 7) : 'undated';
        if (!groups.has(month)) groups.set(month, []);
        groups.get(month).push(post);
      });
      const fragment = document.createDocumentFragment();
      for (const [key, group] of groups) {
        let title = 'Undated';
        if (key !== 'undated') {
          const date = new Date(`${key}-01T00:00:00Z`);
          if (!Number.isNaN(date.getTime())) {
            title = date.toLocaleDateString('en-US', {timeZone: 'UTC', month: 'long', year: 'numeric'});
          }
        }
        const section = make('section', 'month-group');
        const heading = make('div', 'blog-section-head');
        heading.append(make('h2', '', title), make('p', '', `${group.length} entries`));
        const grid = make('div', 'blog-grid');
        group.forEach(post => grid.append(card(post)));
        section.append(heading, grid);
        fragment.append(section);
      }
      element.replaceChildren(fragment);
    }

    function render() {
      const scoped = monthScope();
      const posts = selectRecords();
      if (count) count.textContent = String(scoped.length);
      if (status) status.textContent = `Showing ${posts.length} of ${scoped.length} articles`;
      if (view === 'home' || view === 'journal') {
        fillCards(containers.featured, posts.slice(0, 4));
        fillCards(containers.recent, posts.slice(4));
      } else if (view === 'archive') {
        fillArchive(containers.archive, posts);
      } else if (view === 'rss') {
        fillCards(containers.rss, posts);
      } else if (view === 'month') {
        fillCards(containers.month, posts);
      }
      if (posts.length === 0) {
        destination.append(make('p', 'empty-message', 'No articles match these filters.'));
      }
    }

    function shuffleRecords() {
      const urls = records.map(post => post.url);
      for (let i = urls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [urls[i], urls[j]] = [urls[j], urls[i]];
      }
      randomRanks = new Map(urls.map((value, index) => [value, index]));
      if (shuffle) shuffle.setAttribute('aria-pressed', 'true');
      render();
    }

    async function initialize() {
      try {
        const response = await fetch('/blog/catalog.json', {cache: 'no-cache'});
        if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
        const catalog = await response.json();
        if (!catalog || !Array.isArray(catalog.posts)) throw new Error('Invalid catalog structure');
        const seen = new Set();
        const next = [];
        for (const entry of catalog.posts) {
          const post = normalize(entry);
          if (!post || seen.has(post.url)) continue;
          seen.add(post.url);
          next.push(post);
        }
        if (catalog.posts.length && next.length === 0) {
          throw new Error('No valid article URLs in catalog');
        }
        records = next;
      } catch (error) {
        // Do not replace already-rendered article cards if the network fails.
        if (status) status.textContent = 'Showing the static article index (filters unavailable).';
        console.warn('ZZX-BLOG: catalog unavailable; preserving static HTML.', error);
        return;
      }
      const scoped = monthScope();
      populateSelect(category, scoped.map(post => post.category), 'categories');
      populateSelect(tag, scoped.flatMap(post => post.tags), 'topics');
      for (const control of [search, category, tag, sort, publication]) {
        if (!control) continue;
        control.addEventListener(control === search ? 'input' : 'change', () => {
          randomRanks = null;
          if (shuffle) shuffle.setAttribute('aria-pressed', 'false');
          render();
        });
      }
      if (shuffle) shuffle.addEventListener('click', shuffleRecords);
      render();
    }

    initialize();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once: true});
  } else {
    boot();
  }
})();
