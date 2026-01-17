// blog/blog-posts/script.js
// Canonical source of truth:
//   /blog/blog-posts/manifest.json  (newest first)
// No browser access to .tank or .posted.
// Infinite scroll + search + tag filter + shuffle, grouped by month headings.

(() => {
  const ARCH = document.getElementById("archives");
  const SHUFFLE = document.getElementById("shuffle");
  const SEARCH = document.getElementById("search");
  const TAGSEL = document.getElementById("tag-filter");

  const MANIFEST_URL = "/blog/blog-posts/manifest.json";
  const BATCH_GROUPS = 2; // number of month-groups to append per batch

  let ALL = [];
  let VIEW = [];
  let TAGS = new Set();

  let GROUPS = [];   // [ [monthKey, posts[]], ... ] newest month -> oldest
  let gCursor = 0;

  let io = null;
  let sentinel = null;
  let loaderEl = null;
  let endEl = null;

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
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  function normalize(p) {
    const d = p.date ? new Date(p.date) : new Date(0);
    const iso = isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
    return {
      title: p.title || "Untitled",
      url: p.url || "#",
      description: p.description || "",
      date: iso,
      thumb: p.thumb || "",
      tags: Array.isArray(p.tags) ? p.tags : []
    };
  }

  function dedupeByUrl(list) {
    const seen = new Set();
    const out = [];
    for (const it of list) {
      if (!it || !it.url) continue;
      if (!seen.has(it.url)) {
        seen.add(it.url);
        out.push(it);
      }
    }
    return out;
  }

  function collectTags(items) {
    TAGS = new Set();
    items.forEach(p => (p.tags || []).forEach(t => TAGS.add(t)));
  }

  function fillTagSelect() {
    TAGSEL.innerHTML = '<option value="">All tags</option>';
    [...TAGS].sort().forEach(t => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      TAGSEL.appendChild(o);
    });
  }

  function matchesFilters(p) {
    const q = (SEARCH.value || "").toLowerCase().trim();
    const tag = TAGSEL.value;
    const hay = `${p.title} ${p.description} ${(p.tags || []).join(" ")}`.toLowerCase();
    const okText = !q || hay.includes(q);
    const okTag = !tag || (p.tags || []).includes(tag);
    return okText && okTag;
  }

  function groupByMonth(items) {
    const map = new Map(); // "YYYY-MM" -> posts[]
    for (const it of items) {
      const d = new Date(it.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    // Ensure each month group is newest->oldest inside
    const groups = [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([k, posts]) => [k, posts.sort((a, b) => new Date(b.date) - new Date(a.date))]);
    return groups;
  }

  function monthLabel(key) {
    const [y, m] = key.split("-");
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
    return dt.toLocaleString(undefined, { month: "long", year: "numeric" });
  }

  function renderPost(it) {
    const wrap = el("div", "feature");

    const thumb = el("div", "thumb");
    if (it.thumb) {
      const img = new Image();
      img.alt = "";
      img.src = it.thumb;
      thumb.appendChild(img);
    } else {
      thumb.appendChild(el("span", "muted", "—"));
    }
    wrap.appendChild(thumb);

    const body = el("div", "body");

    const h4 = el("h4");
    const a = el("a", null, it.title);
    a.href = it.url;
    h4.appendChild(a);
    body.appendChild(h4);

    if (it.description) body.appendChild(el("p", null, it.description));

    const btn = el("a", "btn", "Read Post");
    btn.href = it.url;
    body.appendChild(btn);

    body.appendChild(el("div", "meta", new Date(it.date).toLocaleString()));

    if (it.tags && it.tags.length) {
      const tg = el("div", "tags");
      it.tags.forEach(t => tg.appendChild(el("span", "tag", t)));
      body.appendChild(tg);
    }

    wrap.appendChild(body);
    return wrap;
  }

  function ensureSentinel() {
    if (sentinel) return;

    sentinel = el("div", null);
    sentinel.id = "scroll-sentinel";

    loaderEl = el("p", "loading", "Loading more…");
    endEl = el("p", "loading", "You’ve reached the first post.");
    endEl.style.display = "none";

    sentinel.appendChild(loaderEl);
    sentinel.appendChild(endEl);

    ARCH.parentNode.insertBefore(sentinel, ARCH.nextSibling);
  }

  function resetFeed() {
    ARCH.innerHTML = "";
    gCursor = 0;
    ensureSentinel();
    loaderEl.style.display = "";
    endEl.style.display = "none";
  }

  function appendNextGroups() {
    const remaining = GROUPS.length - gCursor;
    if (remaining <= 0) {
      loaderEl.style.display = "none";
      endEl.style.display = "";
      return;
    }

    const take = Math.min(BATCH_GROUPS, remaining);
    for (let i = 0; i < take; i++) {
      const [key, posts] = GROUPS[gCursor++];
      const group = el("div", "month-group");
      group.appendChild(el("h3", null, monthLabel(key)));
      posts.forEach(p => group.appendChild(renderPost(p)));
      ARCH.appendChild(group);
    }

    if (gCursor >= GROUPS.length) {
      loaderEl.style.display = "none";
      endEl.style.display = "";
    } else {
      loaderEl.style.display = "";
      endEl.style.display = "none";
    }
  }

  function rebuildView({ shuffle = false } = {}) {
    VIEW = ALL.filter(matchesFilters);
    VIEW.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (shuffle) shuffleInPlace(VIEW);

    GROUPS = groupByMonth(VIEW);
    resetFeed();
    appendNextGroups();
  }

  function setupIO() {
    ensureSentinel();
    if (io) io.disconnect();

    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) appendNextGroups();
        }
      },
      { root: null, rootMargin: "900px", threshold: 0.01 }
    );

    io.observe(sentinel);
  }

  async function boot() {
    ARCH.innerHTML = '<p class="loading">Loading posts…</p>';

    const mf = await fetchJSON(MANIFEST_URL);
    const items = Array.isArray(mf?.posts) ? mf.posts.map(normalize) : [];

    if (!items.length) {
      ARCH.innerHTML = "";
      ARCH.appendChild(el("p", "loading", "No posts found. (Missing /blog/blog-posts/manifest.json?)"));
      return;
    }

    ALL = dedupeByUrl(items).sort((a, b) => new Date(b.date) - new Date(a.date));

    collectTags(ALL);
    fillTagSelect();

    rebuildView({ shuffle: false });
    setupIO();

    SHUFFLE?.addEventListener("click", () => rebuildView({ shuffle: true }));

    let debounce = null;
    SEARCH?.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => rebuildView({ shuffle: false }), 120);
    });

    TAGSEL?.addEventListener("change", () => rebuildView({ shuffle: false }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
