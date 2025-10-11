// /projects/script.js — Projects root (rows layout + global search)
(() => {
  const CATEGORIES = [
    { key: "web",      mountId: "proj-web",      base: "/projects/web/" },
    { key: "software", mountId: "proj-software", base: "/projects/software/" },
    { key: "hardware", mountId: "proj-hardware", base: "/projects/hardware/" }
  ];

  const state = { totals: 0 };

  // ---------- utils ----------
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const isHttp = (s) => /^https?:\/\//i.test(String(s || ""));

  function debounce(fn, ms = 120) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      console.warn("Manifest load failed:", url, e);
      return { projects: [] };
    }
  }

  function safeLogoFor(p, base) {
    let logo = p.logo || "";
    const slug = p.slug || "";

    // Replace placeholder /_/logo.* -> /<slug>/logo.*
    if (logo && /\/_\/logo\.(png|jpe?g|webp|svg)$/i.test(logo) && slug) {
      logo = logo.replace("/_/", `/${slug}/`);
    }
    // Derive from href if missing
    if (!logo && p.href) {
      const baseHref = p.href.endsWith("/") ? p.href : (p.href + "/");
      logo = baseHref + "logo.png";
    }
    // Last fallback
    if (!logo && slug) logo = `${base}${slug}/logo.png`;
    return logo;
  }

  function makeRow(p, base) {
    const slug   = p.slug || "";
    const href   = p.href || `${base}${slug}/`;
    const logo   = safeLogoFor(p, base);
    const title  = p.title || slug || "Untitled";
    const blurb  = p.blurb || "";
    const github = p.github_url || p.github || "";
    const tags   = Array.isArray(p.tags) ? p.tags.join(" ") : "";

    const row = document.createElement("div");
    row.className = "project-row";
    // filtering dataset
    row.dataset.title = (title || "").toLowerCase();
    row.dataset.slug  = (slug || "").toLowerCase();
    row.dataset.blurb = (blurb || "").toLowerCase();
    row.dataset.tags  = (tags || "").toLowerCase();

    row.innerHTML = `
      <a class="project-logo" href="${href}">
        <img src="${logo}" alt="${title} logo" width="64" height="64"
             loading="lazy" decoding="async"/>
      </a>
      <div class="project-meta">
        <h3><a href="${href}">${title}</a></h3>
        <p class="muted">${blurb}</p>
        <div class="links">
          <a class="btn" href="${href}" ${isHttp(href) ? 'target="_blank" rel="noopener noreferrer"' : ""}>Open</a>
          ${github ? `<a class="btn ghost" href="${github}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ""}
        </div>
      </div>
    `;
    return row;
  }

  function renderCategory(mount, items, base) {
    if (!mount) return;
    mount.innerHTML = "";

    const wrap = el("div", "project-list");
    if (!Array.isArray(items) || !items.length) {
      wrap.appendChild(el("p", "muted", "No projects yet."));
      mount.appendChild(wrap);
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(p => frag.appendChild(makeRow(p, base)));
    wrap.appendChild(frag);
    mount.appendChild(wrap);
  }

  // ---------- search ----------
  function ensureSearchUI() {
    let box = document.getElementById("proj-search-wrap");
    if (box) return;

    // Insert after the intro <section class="container"> (the first one you have)
    const firstContainer = document.querySelector("main .container");
    if (!firstContainer) return;

    box = document.createElement("section");
    box.className = "container";
    box.id = "proj-search-wrap";
    box.innerHTML = `
      <div class="searchbar">
        <input id="proj-search" type="search" placeholder="Search projects by title, slug, tags, or blurb…" />
        <span id="search-count" class="muted"></span>
      </div>
    `;
    firstContainer.parentNode.insertBefore(box, firstContainer.nextSibling);
  }

  function currentQuery() {
    return (document.getElementById("proj-search")?.value || "").trim().toLowerCase();
  }

  function applyFilter() {
    const q = currentQuery();
    let shown = 0;
    const total = state.totals;

    // go through each category’s rows
    ["proj-web", "proj-software", "proj-hardware"].forEach(id => {
      const mount = document.getElementById(id);
      if (!mount) return;
      const rows = mount.querySelectorAll(".project-row");
      rows.forEach(row => {
        if (!q) {
          row.style.display = "";
          shown++;
          return;
        }
        const hay = `${row.dataset.title} ${row.dataset.slug} ${row.dataset.blurb} ${row.dataset.tags}`;
        if (hay.includes(q)) {
          row.style.display = "";
          shown++;
        } else {
          row.style.display = "none";
        }
      });
    });

    const countEl = document.getElementById("search-count");
    if (countEl) countEl.textContent = q ? `Showing ${shown} of ${total}` : "";
  }

  const debouncedFilter = debounce(applyFilter, 120);

  // ---------- boot ----------
  async function boot() {
    // placeholders
    ["proj-web", "proj-software", "proj-hardware"].forEach(id => {
      const m = document.getElementById(id);
      if (m && !m.innerHTML.trim()) m.innerHTML = `<p class="loading">Loading…</p>`;
    });

    // load all three
    const results = await Promise.all(
      CATEGORIES.map(c =>
        fetchJSON(`${c.base}manifest.json`).then(data => ({
          base: c.base,
          mount: document.getElementById(c.mountId),
          list: Array.isArray(data?.projects) ? data.projects : []
        }))
      )
    );

    // render + count
    state.totals = 0;
    results.forEach(({ mount, base, list }) => {
      state.totals += list.length;
      renderCategory(mount, list, base);
    });

    // search
    ensureSearchUI();
    const input = document.getElementById("proj-search");
    if (input) input.addEventListener("input", debouncedFilter);
    applyFilter();
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", boot, { once: true })
    : boot();
})();
