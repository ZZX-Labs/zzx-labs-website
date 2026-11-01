/*
 * ZZX-LABS R&D — Archive / Journal catalog renderer
 * Path: /blog/archive.js
 *
 * This module supports older pages with #post-grid. The current v5 pages that
 * use #archives, #featured-list or #recent-list are managed by /blog/script.js.
 *
 * One source: /blog/catalog.json. No dependencies, network calls to third
 * parties, stock image substitution, or modifications to /assets/hero/.
 */
(() => {
    'use strict';

    const byId = (id) => document.getElementById(id);
    const grid = byId('post-grid');
    if (!grid) return;

    const search = byId('search');
    const category = byId('category') || byId('category-filter');
    const sort = byId('sort') || byId('sort-order');
    const publicationStatus = byId('publication-status');
    const count = byId('counter') || byId('blog-status');
    const previous = byId('prev');
    const next = byId('next');
    const pageLabel = byId('page-label');

    // A default of 0 means ALL records are visible. Pagination is opt-in.
    // Example: <div id="post-grid" data-page-size="24"></div>
    const requestedSize = Number.parseInt(grid.dataset.pageSize || '0', 10);
    const pageSize = Number.isFinite(requestedSize) && requestedSize > 0
        ? Math.min(requestedSize, 1000)
        : 0;

    let records = [];
    let page = 0;

    function create(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = String(text);
        if (className) node.className = className;
        return node;
    }

    function canonicalArticleUrl(raw) {
        if (typeof raw !== 'string') return null;
        const url = raw.trim();
        // Restrict links to local article locations; disallow path traversal,
        // query strings, external origins and JavaScript schemes.
        if (!/^\/blog\/blog-posts\/[a-zA-Z0-9/_-]+\/?$/.test(url)) return null;
        if (url.includes('//') || url.split('/').some((part) => part === '.' || part === '..')) return null;
        return url.endsWith('/') ? url : `${url}/`;
    }

    function heroUrl(raw) {
        return typeof raw === 'string' &&
            /^\/assets\/hero\/[a-z0-9][a-z0-9-]*\.png$/.test(raw)
            ? raw
            : null;
    }

    function formatDate(raw) {
        const parsed = new Date(raw || '');
        return !Number.isNaN(parsed.getTime())
            ? parsed.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
            : 'Undated';
    }

    function publicationLabel(post) {
        if (post.published === true || post.status === 'published') return 'Published';
        if (post.status === 'source-missing') return 'Archive · original source missing';
        if (post.status === 'recovered-draft') return 'Recovered archive · review pending';
        if (post.status === 'pending' || post.status === 'scheduled') return 'Editorial queue';
        return 'Archive entry';
    }

    function hasAvailableArticle(post) {
        if (!post.url) return false;
        // Recovered article files are present in v5, even when an editorial
        // check remains outstanding. Queued and unpublished posts are not.
        return !['pending', 'scheduled', 'unpublished', 'draft'].includes(post.status);
    }

    function fallbackArt(label) {
        return create('div', label || 'ZZX-Labs research', 'tile-image-fallback');
    }

    function card(post) {
        const item = create('article', undefined, 'tile blog-card');
        const art = create('div', undefined, 'blog-card-art');
        const source = post.thumb;

        if (source) {
            const img = create('img');
            img.src = source;
            img.alt = post.heroAlt || `Editorial artwork for ${post.title}`;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.width = 1920;
            img.height = 1080;
            img.addEventListener('error', () => {
                // A failed image is not evidence that an installer is required.
                art.replaceChildren(fallbackArt(post.category));
            }, { once: true });
            art.appendChild(img);
        } else {
            art.appendChild(fallbackArt(post.category));
        }
        item.appendChild(art);

        const body = create('div', undefined, 'body blog-card-body');
        const dateSuffix = post.historicalDateUnverified ? ' · archive placement date' : '';
        body.appendChild(create('div',
            `${formatDate(post.date)}${dateSuffix} · ${post.category}`, 'meta blog-meta'));

        const heading = create('h3');
        if (hasAvailableArticle(post)) {
            const link = create('a', post.title);
            link.href = post.url;
            heading.appendChild(link);
        } else {
            heading.appendChild(create('span', post.title));
        }
        body.appendChild(heading);
        body.appendChild(create('p', post.description || 'Research and development article'));

        if (post.tags.length) {
            const tags = create('div', undefined, 'blog-tags');
            for (const tag of post.tags.slice(0, 5)) {
                tags.appendChild(create('span', tag, 'blog-tag'));
            }
            body.appendChild(tags);
        }

        body.appendChild(create('span', publicationLabel(post), 'state archive-flag'));
        if (hasAvailableArticle(post)) {
            const link = create('a', 'Read article', 'read-link blog-read');
            link.href = post.url;
            body.appendChild(link);
        }
        item.appendChild(body);
        return item;
    }

    function render() {
        const query = (search?.value || '').trim().toLocaleLowerCase();
        const selectedCategory = category?.value || '';
        const state = publicationStatus?.value || 'all';
        const ordering = sort?.value || 'newest';

        const matching = records.filter((post) => {
            const searchable = [post.title, post.description, post.category, ...post.tags]
                .join(' ').toLocaleLowerCase();
            const isPublished = post.published || post.status === 'published';
            return (!query || searchable.includes(query)) &&
                (!selectedCategory || selectedCategory === post.category) &&
                (state === 'all' || (state === 'published' ? isPublished : !isPublished));
        });

        if (ordering === 'title') {
            matching.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            matching.sort((a, b) => {
                const cmp = (a.date || '').localeCompare(b.date || '');
                return ordering === 'oldest' ? cmp : -cmp;
            });
        }

        const pageCount = pageSize ? Math.max(1, Math.ceil(matching.length / pageSize)) : 1;
        page = Math.max(0, Math.min(page, pageCount - 1));
        const visible = pageSize
            ? matching.slice(page * pageSize, (page + 1) * pageSize)
            : matching;

        const fragment = document.createDocumentFragment();
        for (const post of visible) fragment.appendChild(card(post));
        if (!visible.length) {
            fragment.appendChild(create('p', 'No articles match the selected filters.', 'empty empty-message'));
        }
        grid.replaceChildren(fragment);

        if (count) {
            count.textContent = `${matching.length} of ${records.length} articles`;
        }
        if (pageLabel) pageLabel.textContent = `Page ${page + 1} / ${pageCount}`;
        if (previous) previous.disabled = page <= 0;
        if (next) next.disabled = page >= pageCount - 1;
    }

    function normalize(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const url = canonicalArticleUrl(raw.url);
        if (!url) return null;
        return {
            url,
            title: String(raw.title || 'Untitled'),
            description: String(raw.description || ''),
            date: String(raw.date || ''),
            category: String(raw.category || 'Research'),
            tags: Array.isArray(raw.tags) ? raw.tags.filter((x) => typeof x === 'string') : [],
            thumb: heroUrl(raw.thumb || raw.image),
            heroAlt: String(raw.hero_alt || raw.alt || ''),
            published: raw.published === true,
            status: String(raw.status || ''),
            historicalDateUnverified: raw.historical_date_unverified === true
        };
    }

    async function boot() {
        try {
            const response = await fetch('/blog/catalog.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
            const data = await response.json();
            if (!data || !Array.isArray(data.posts)) throw new Error('Invalid catalog.json');

            const urls = new Set();
            const images = new Set();
            records = [];
            for (const raw of data.posts) {
                const post = normalize(raw);
                if (!post || urls.has(post.url)) continue;
                urls.add(post.url);
                if (post.thumb && images.has(post.thumb)) {
                    console.warn('ZZX-BLOG: duplicate artwork assignment:', post.thumb);
                    post.thumb = null;
                }
                if (post.thumb) images.add(post.thumb);
                records.push(post);
            }

            if (category) {
                const previousCategory = category.value;
                // Avoid duplicating options if a previous initialization ran.
                for (const option of [...category.options]) {
                    if (option.value !== '') option.remove();
                }
                for (const name of [...new Set(records.map((post) => post.category))].sort()) {
                    const option = create('option', name);
                    option.value = name;
                    category.appendChild(option);
                }
                if ([...category.options].some((x) => x.value === previousCategory)) {
                    category.value = previousCategory;
                }
            }

            // Never hide recovered articles by default. All 48 source records
            // are listed unless the reader chooses a publication-state filter.
            if (publicationStatus && [...publicationStatus.options].some((opt) => opt.value === 'all')) {
                publicationStatus.value = 'all';
            }
            render();
        } catch (error) {
            console.error('ZZX-BLOG: failed to read /blog/catalog.json:', error);
            if (count) count.textContent = 'Catalog unavailable';
            // Leave server-rendered article markup intact if present.
            if (!grid.children.length) {
                grid.appendChild(create('p',
                    'Article catalog unavailable. Check /blog/catalog.json on this deployment.', 'empty'));
            }
        }
    }

    for (const control of [search, category, sort, publicationStatus]) {
        control?.addEventListener('input', () => { page = 0; render(); });
    }
    previous?.addEventListener('click', () => { page--; render(); });
    next?.addEventListener('click', () => { page++; render(); });

    boot();
})();
