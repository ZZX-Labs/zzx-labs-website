/* ZZX-BLOG: public API directory, no framework and no administrative operations. */
(() => {
    'use strict';

    const form = document.getElementById('api-search-form');
    if (!form) return;

    const search = document.getElementById('api-search');
    const category = document.getElementById('api-category');
    const state = document.getElementById('api-state');
    const count = document.getElementById('api-count');
    const message = document.getElementById('api-status');
    const output = document.getElementById('api-results');
    let posts = [];

    const str = value => value == null ? '' : String(value);
    const make = (tag, css, content) => {
        const item = document.createElement(tag);
        if (css) item.className = css;
        if (content !== undefined) item.textContent = content;
        return item;
    };
    const safeArticlePath = value => {
        const path = str(value);
        return /^\/blog\/blog-posts\/(?:[A-Za-z0-9_-]+\/)+$/.test(path) ? path : '';
    };
    const mapPost = raw => {
        const published = raw.published === true || raw.status === 'published';
        return {
            title: str(raw.title || 'Untitled'),
            url: safeArticlePath(raw.url),
            date: str(raw.date),
            category: str(raw.category || 'Research'),
            description: str(raw.description),
            tags: Array.isArray(raw.tags) ? raw.tags.map(str) : [],
            state: published ? 'published' : 'pending'
        };
    };

    function render() {
        const query = search.value.trim().toLocaleLowerCase();
        const selectedCategory = category.value;
        const selectedState = state.value;
        const filtered = posts.filter(post => {
            if (selectedCategory && post.category !== selectedCategory) return false;
            if (selectedState && post.state !== selectedState) return false;
            return !query || [post.title, post.description, post.category, ...post.tags]
                .some(value => value.toLocaleLowerCase().includes(query));
        });
        output.replaceChildren();
        for (const post of filtered) {
            const card = make('article', 'api-result');
            const meta = make('p', 'api-result-meta', [post.category, post.date.slice(0, 10)].filter(Boolean).join(' · '));
            const title = make('h3');
            if (post.url) {
                const link = make('a', '', post.title);
                link.href = post.url;
                title.append(link);
            } else {
                title.textContent = post.title;
            }
            card.append(meta, title);
            if (post.description) card.append(make('p', 'api-result-description', post.description));
            const note = make('p', 'api-record-state', post.state === 'published' ? 'Published' : 'Pending editorial review');
            card.append(note);
            output.append(card);
        }
        if (!filtered.length) output.append(make('p', 'empty-message', 'No articles match the current filters.'));
        message.textContent = `Showing ${filtered.length} of ${posts.length} public catalog records.`;
    }

    async function load() {
        let records;
        for (const url of ['/blog/catalog.json', '/blog/api/posts.json']) {
            try {
                const response = await fetch(url, {cache: 'no-store'});
                if (!response.ok) continue;
                const data = await response.json();
                if (!data || !Array.isArray(data.posts)) continue;
                records = data.posts;
                break;
            } catch (_) { /* Try the next public endpoint. */ }
        }
        if (!records) {
            count.textContent = 'Catalog unavailable';
            message.textContent = 'Could not load the article catalog. Use the JSON or RSS links above.';
            return;
        }
        const seen = new Set();
        posts = records.map(mapPost).filter(post => {
            if (!post.url || seen.has(post.url)) return false;
            seen.add(post.url);
            return true;
        });
        posts.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || a.title.localeCompare(b.title));
        for (const name of [...new Set(posts.map(post => post.category))].sort()) {
            const option = make('option', '', name);
            option.value = name;
            category.append(option);
        }
        count.textContent = `${posts.length} public records`;
        render();
    }

    search.addEventListener('input', render);
    category.addEventListener('change', render);
    state.addEventListener('change', render);
    form.addEventListener('reset', () => queueMicrotask(render));
    load();
})();
