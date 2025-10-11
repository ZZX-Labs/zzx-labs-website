// Top-level Projects — render category sections with small logo cards (120x120)
(() => {
  const CATEGORIES = [
    { key: "web",      mountId: "proj-web",      base: "/projects/web/" },
    { key: "software", mountId: "proj-software", base: "/projects/software/" },
    { key: "hardware", mountId: "proj-hardware", base: "/projects/hardware/" }
  ];

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s || "").replace(/[&<>]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c]));
  const attr = (s) => String(s || "").replace(/"/g, "&quot;");
  const normalizeLogo = (s) => String(s || "").replace("/_/logo.png", "/logo.png");

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      console.warn("Failed to load:", url, e);
      return { __error: true };
    }
  }

  function renderCategory(mount, items, base) {
    if (!mount) return;
    mount.innerHTML = "";

    if (!Array.isArray(items) || !items.length) {
      mount.appendChild(el("p", "muted", "No projects listed yet."));
      return;
    }

    const grid = el("div", "cards-grid");
    mount.appendChild(grid);

    items.forEach(p => {
      const slug   = p.slug || "";
      const href   = p.href || `${base}${slug}/`;
      const logo   = normalizeLogo(p.logo || `${base}${slug}/logo.png`);
      const title  = p.title || slug || "Untitled";
      const blurb  = p.blurb || "";
      const github = p.github || "";

      const card = el("article", "card project-card", `
        <a class="card-media" href="${attr(href)}" aria-label="${attr(title)}">
          <img class="card-logo" src="${attr(logo)}" alt="${attr(title)} logo"
               width="120" height="120" loading="lazy" decoding="async" />
        </a>
        <div class="card-body">
          <h3 class="card-title"><a href="${attr(href)}">${esc(title)}</a></h3>
          <p class="card-blurb">${esc(blurb)}</p>
          <div class="card-cta">
            <a class="btn" href="${attr(href)}">Open</a>
            ${github ? `<a class="btn ghost" href="${attr(github)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ""}
          </div>
        </div>
      `);

      const img = card.querySelector(".card-logo");
      img.addEventListener("error", () => {
        img.src = "/static/placeholder-logo.svg";
        img.classList.add("fallback");
      });

      grid.appendChild(card);
    });
  }

  async function boot() {
    // placeholders
    CATEGORIES.forEach(({ mountId }) => {
      const m = document.getElementById(mountId);
      if (m && !m.innerHTML.trim()) m.innerHTML = '<p class="loading">Loading projects…</p>';
    });

    const results = await Promise.all(
      CATEGORIES.map(c =>
        fetchJSON(`${c.base}manifest.json`).then(data => ({
          mount: document.getElementById(c.mountId),
          base: c.base,
          items: Array.isArray(data?.projects) ? data.projects : []
        }))
      )
    );

    results.forEach(({ mount, base, items }) => renderCategory(mount, items, base));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
