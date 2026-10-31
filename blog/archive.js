/*
 * ZZX-Labs R&D — editorial archive browser.
 * Framework-free, progressive enhancement, no external services.
 * All catalog text is inserted with textContent (never innerHTML).
 */
(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const mount = $('post-grid');

    // The script is shared by /blog/ and /blog/blog-posts/.
    if (!mount) {
        return;
    }

    const search = $('search');
    const category = $('category');
    const sort = $('sort');
    const counter = $('counter');
    const previous = $('prev');
    const next = $('next');
    const pageLabel = $('page-label');
    const PAGE_SIZE = 12;

    let records = [];
    let page = 0;

    function create(tag, text, className) {
        const element = document.createElement(tag);

        if (text !== undefined) {
            element.textContent = text;
        }
        if (className) {
            element.className = className;
        }
        return element;
    }

    function safeBlogPath(path) {
        return typeof path === 'string' &&
            path.startsWith('/blog/') &&
            !path.startsWith('//') &&
            !path.includes('..') ? path : null;
    }

    function formatDate(isoDate) {
        if (!isoDate) {
            return 'Undated';
        }
        const value = new Date(isoDate);
        if (Number.isNaN(value.getTime())) {
            return 'Undated';
        }
        return value.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC'
        });
    }

    function createCard(post) {
        const tile = create('article', undefined, 'tile');
        const imagePath = safeBlogPath(post.thumb);

        if (imagePath) {
            const image = document.createElement('img');
            image.loading = 'lazy';
            image.decoding = 'async';
            image.src = imagePath;
            image.alt = 'Illustrative archive thumbnail';
            tile.appendChild(image);
        }

        const body = create('div', undefined, 'body');
        body.appendChild(
            create('div', `${formatDate(post.date)} · ${post.category || 'Research'}`, 'meta')
        );

        const heading = create('h3');
        const link = create('a', post.title || 'Untitled article');
        link.href = safeBlogPath(post.url) || '#';
        heading.appendChild(link);
        body.appendChild(heading);
        body.appendChild(create('p', post.description || 'Archive entry'));

        const status = post.published
            ? 'Publisher verified route'
            : (post.recovered ? 'Recovered draft · review' : 'Source pending');
        body.appendChild(create('span', status, 'state'));
        tile.appendChild(body);
        return tile;
    }

    function redraw() {
        const query = search.value.trim().toLowerCase();
        const selectedCategory = category.value;

        const matching = records.filter((post) => {
            const haystack = [post.title, post.description, ...(post.tags || [])]
                .filter(Boolean).join(' ').toLowerCase();
            return (!query || haystack.includes(query)) &&
                (!selectedCategory || post.category === selectedCategory);
        });

        if (sort.value === 'title') {
            matching.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sort.value === 'oldest') {
            matching.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        } else {
            matching.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
        }

        const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
        page = Math.min(Math.max(0, page), pages - 1);
        mount.replaceChildren();

        const start = page * PAGE_SIZE;
        matching.slice(start, start + PAGE_SIZE)
            .forEach((post) => mount.appendChild(createCard(post)));

        if (!matching.length) {
            mount.appendChild(
                create('p', 'No matching posts. Try another search.', 'empty')
            );
        }

        counter.textContent = `${matching.length} entries`;
        pageLabel.textContent = `Page ${page + 1} / ${pages}`;
        previous.disabled = page === 0;
        next.disabled = page >= pages - 1;
    }

    function loadJson(url, optional = false) {
        return fetch(url, { cache: 'no-cache' })
            .then((response) => {
                if (!response.ok) {
                    if (optional) {
                        return { posts: [] };
                    }
                    throw new Error(`Archive manifest unavailable (${response.status})`);
                }
                return response.json();
            })
            .catch((error) => {
                if (optional) {
                    return { posts: [] };
                }
                throw error;
            });
    }

    Promise.all([
        loadJson('/blog/catalog.json'),
        loadJson('/blog/zzxblog-posts.json', true)
    ]).then(([catalog, publisher]) => {
        const legacyPosts = catalog.posts || [];
        const newPosts = (publisher.posts || [])
            .filter((post) => typeof post.url === 'string' &&
                post.url.startsWith('/blog/posts/') && safeBlogPath(post.url))
            .map((post) => ({
                title: post.title,
                url: post.url,
                description: post.description || '',
                date: post.date,
                tags: post.tags || [],
                thumb: post.thumb || '',
                category: 'New Publications',
                published: true,
                recovered: true
            }));

        const publishedPaths = new Set(newPosts.map((post) => post.url));
        records = [
            ...newPosts,
            ...legacyPosts.filter((post) => !publishedPaths.has(post.url))
        ];

        const categories = [...new Set(records.map((post) => post.category))].sort();
        categories.forEach((name) => {
            const option = create('option', name);
            option.value = name;
            category.appendChild(option);
        });
        redraw();
    }).catch(() => {
        counter.textContent = 'Archive data failed to load';
        mount.appendChild(create(
            'p',
            'Archive manifest could not be loaded. ' +
                'Use a local HTTP server rather than opening index.html with file://.',
            'empty'
        ));
    });

    [search, category, sort].forEach((control) => {
        control.addEventListener('input', () => {
            page = 0;
            redraw();
        });
    });
    previous.addEventListener('click', () => {
        page -= 1;
        redraw();
    });
    next.addEventListener('click', () => {
        page += 1;
        redraw();
    });
})();
