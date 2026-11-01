/* ZZX-BLOG API index: read-only, client-side article search. Vanilla JS. */
(() => {
    'use strict';

    const form = document.getElementById('api-search-form');
    if (!form) return;

    const search = document.getElementById('api-search');
    const category = document.getElementById('api-category');
    const total = document.getElementById('api-total');
    const status = document.getElementById('api-status');
    const results = document.getElementById('api-results');
    let posts = [];

    const text = value => String(value == null ? '' : value);
    const element = (name, cls, content) => {
        const node = document.createElement(name);
        if (cls) node.className = cls;
        if (content !== undefined) node.textContent = content;
        return node;
    };
    const validArticlePath = value => {
        const path = text(value);
        return /^\/blog\/blog-posts\/[a-zA-Z0-9/_-]+\/$/.test(path) ? path : null;
    };
    const parsePost = p => ({
        title: text(p.title || 'Untitled'),
        url: validArticlePath(p.url),
        description: text(p.description || ''),
        date: text(p.date || ''),
        category: text(p.category || 'Research'),
        tags: Array.isArray(p.tags) ? p.tags.map(text) : [],
        status: text(p.status || '')
    });

    function render() {
        const query = search.value.trim().toLocaleLowerCase();
        const selectedCategory = category.value;
        const filtered = posts.filter(p => {
            if (selectedCategory && p.category !== selectedCategory) return false;
            if (!query) return true;
            return [p.title, p.description, p.category, p.status, ...p.tags]
                .some(value => value.toLocaleLowerCase().includes(query));
        });
        results.replaceChildren();
        filtered.forEach(p => {
            const card = element('article', 'api-result');
            const meta = element('p', 'api-result-meta', [p.category, p.date.slice(0, 10)].filter(Boolean).join(' · '));
            const heading = element('h3');
            if (p.url) {
                const link = element('a', null, p.title);
                link.href = p.url;
                heading.append(link);
            } else {
                heading.textContent = p.title;
            }
            card.append(meta, heading);
            if (p.description) card.append(element('p', null, p.description));
            if (p.status) card.append(element('p', 'api-result-meta', `Editorial status: ${p.status}`));
            results.append(card);
        });
        status.textContent = filtered.length === posts.length
            ? `Showing all ${posts.length} archive records.`
            : `Showing ${filtered.length} of ${posts.length} archive records.`;
        if (filtered.length === 0) results.append(element('p', 'empty-message', 'No records match those filters.'));
    }

    async function load() {
        let feed;
        let failure;
        for (const url of ['/blog/api/posts.json', '/blog/catalog.json']) {
            try {
                const response = await fetch(url, {cache: 'no-cache'});
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (!data || !Array.isArray(data.posts)) throw new Error('Invalid posts schema');
                feed = data.posts;
                break;
            } catch (error) {
                failure = error;
            }
        }
        if (!feed) {
            total.textContent = 'Unavailable';
            status.textContent = 'Unable to load the public article catalog. Try the JSON or RSS endpoint links above.';
            results.replaceChildren();
            return;
        }
        const seen = new Set();
        posts = feed.map(parsePost).filter(p => {
            if (!p.url || seen.has(p.url)) return false;
            seen.add(p.url);
            return true;
        });
        posts.sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.title.localeCompare(b.title));
        const categories = [...new Set(posts.map(p => p.category))].sort((a, b) => a.localeCompare(b));
        categories.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            category.append(option);
        });
        total.textContent = `${posts.length} archive records`;
        render();
    }

    search.addEventListener('input', render);
    category.addEventListener('change', render);
    form.addEventListener('reset', () => {
        // Native reset updates fields immediately after this event.
        queueMicrotask(render);
    });
    load();
})();
