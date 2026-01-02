// /projects/script.js — Projects root (rows layout + global search + #### category counts + per-project #### badges)
(() => {
  "use strict";

  const CATEGORIES = [
    { key: "adult",               title: "Adult",               mountId: "proj-adult",               base: "/projects/adult/" },
    { key: "ai",                  title: "AI",                  mountId: "proj-ai",                  base: "/projects/ai/" },
    { key: "apps",                title: "Apps",                mountId: "proj-apps",                base: "/projects/apps/" },
    { key: "bitcoin",             title: "Bitcoin",             mountId: "proj-bitcoin",             base: "/projects/bitcoin/" },
    { key: "cyber-investigation", title: "Cyber Investigation", mountId: "proj-cyber-investigation", base: "/projects/cyber-investigation/" },
    { key: "cyber-security",      title: "Cyber Security",      mountId: "proj-cyber-security",      base: "/projects/cyber-security/" },
    { key: "cyber-warfare",       title: "Cyber Warfare",       mountId: "proj-cyber-warfare",       base: "/projects/cyber-warfare/" },
    { key: "firmware",            title: "Firmware",            mountId: "proj-firmware",            base: "/projects/firmware/" },
    { key: "hardware",            title: "Hardware",            mountId: "proj-hardware",            base: "/projects/hardware/" },
    { key: "ml",                  title: "ML",                  mountId: "proj-ml",                  base: "/projects/ml/" },
    { key: "osint",               title: "OSINT",               mountId: "proj-osint",               base: "/projects/osint/" },
    { key: "software",            title: "Software",            mountId: "proj-software",            base: "/projects/software/" },
    { key: "web",                 title: "Web",                 mountId: "proj-web",                 base: "/projects/web/" }
  ];

  const state = { totals: 0, perCat: {} };

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

  function pad4(n) {
    const x = Math.max(0, Number(n || 0));
    return String(x).padStart(4, "0");
  }

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      console.warn("[projects] Manifest load failed:", url, e);
      return { projects: [] };
    }
  }

  function safeLogoFor(p, base) {
    let logo = (p && p.logo) ? String(p.logo) : "";
    const slug = (p && p.slug) ? String(p.slug) : "";

    // Replace placeholder /_/logo.* -> /<slug>/logo.*
    if (logo && /\/_\/logo\.(png|jpe?g|webp|svg)$/i.test(logo) && slug) {
      logo = logo.replace("/_/", `/${slug}/`);
    }

    // Derive from href if missing
    if (!logo && p && p.href) {
      const href = String(p.href);
      const baseHref = href.endsWith("/") ? href : (href + "/");
      logo = baseHref + "logo.png";
    }

    // Last fallback
    if (!logo && slug) logo = `${base}${slug}/logo.png`;

    return logo;
  }

  function makeRow(p, base, idx) {
    const slug   = p.slug ? String(p.slug) : "";
    const href   = p.href ? String(p.href) : (slug ? `${base}${slug}/` : base);
    const logo   = safeLogoFor(p, base);
    const title  = p.title ? String(p.title) : (slug || "Untitled");
    const blurb  = p.blurb ? String(p.blurb) : "";
    const github = (p.github_url || p.github) ? String(p.github_url || p.github) : "";
    const tags   = Array.isArray(p.tags) ? p.tags.join(" ") : "";
    const count  = pad4(idx);

    const row = document.createElement("div");
    row.className = "project-row";

    row.dataset.title = title.toLowerCase();
    row.dataset.slug  = slug.toLowerCase();
    row.dataset.blurb = blurb.toLowerCase();
    row.dataset.tags  = String(tags).toLowerCase();

    row.innerHTML = `
      <div class="proj-count" aria-hidden="true">${count}</div>

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
    items.forEach((p, i) => frag.appendChild(makeRow(p, base, i + 1))); // per-category numbering
    wrap.appendChild(frag);
    mount.appendChild(wrap);
  }

  function setCategoryCount(mountId, count) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    const section = mount.closest("section.container");
    const h2 = section ? section.querySelector("h2") : null;
    if (!h2) return;

    const existing = h2.querySelector(".cat-count");
    if (existing) existing.remove();

    const span = document.createElement("span");
    span.className = "cat-count";
    span.textContent = `(${pad4(count)})`;
    h2.appendChild(span);
  }

  // ---------- search ----------
  function ensureSearchUI() {
    let box = document.getElementById("proj-search-wrap");
    if (box) return;

    // Insert after the first container section inside main
    const firstContainer = document.querySelector("main .container");
    if (!firstContainer) return;

    box = document.createElement("section");
    box.className = "container";
    box.id = "proj-search-wrap";
    box.innerHTML = `
      <div class="searchbar">
        <input id="proj-search" type="search" placeholder="Search projects by title, slug, tags, or blurb…" autocomplete="off" />
        <span id="search-count" class="muted"></span>
      </div>
    `;

    firstContainer.parentNode.insertBefore(box, firstContainer.nextSibling);
  }

  function currentQuery() {
    const v = document.getElementById("proj-search")?.value || "";
    return String(v).trim().toLowerCase();
  }

  function applyFilter() {
    const q = currentQuery();
    let shown = 0;
    const total = state.totals;

    CATEGORIES.forEach(c => {
      const mount = document.getElementById(c.mountId);
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
    // Build search UI FIRST so you never “lose” it even if a manifest fails.
    ensureSearchUI();

    // placeholders
    CATEGORIES.forEach(c => {
      const m = document.getElementById(c.mountId);
      if (m && !m.innerHTML.trim()) m.innerHTML = `<p class="loading">Loading…</p>`;
    });

    // fetch all manifests
    const results = await Promise.all(
      CATEGORIES.map(c =>
        fetchJSON(`${c.base}manifest.json`).then(data => ({
          cat: c,
          mount: document.getElementById(c.mountId),
          list: Array.isArray(data?.projects) ? data.projects : []
        }))
      )
    );

    state.totals = 0;

    results.forEach(({ cat, mount, list }) => {
      state.totals += list.length;
      state.perCat[cat.key] = list.length;

      setCategoryCount(cat.mountId, list.length);
      renderCategory(mount, list, cat.base);
    });

    const input = document.getElementById("proj-search");
    if (input) input.addEventListener("input", debouncedFilter);

    applyFilter();
    console.info("[projects] loaded totals:", state.totals, state.perCat);
  }

  // Run
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
