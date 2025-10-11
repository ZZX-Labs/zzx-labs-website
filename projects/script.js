// Projects root — render category rows (no cards, no grid)
(() => {
  const CATEGORIES = [
    { key: "web",      mountId: "proj-web",      base: "/projects/web/" },
    { key: "software", mountId: "proj-software", base: "/projects/software/" },
    { key: "hardware", mountId: "proj-hardware", base: "/projects/hardware/" }
  ];

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      console.warn("Manifest load failed:", url, e);
      return { __error: true };
    }
  }

  function renderCategory(mount, items, base) {
    if (!mount) return;
    mount.innerHTML = "";

    if (!Array.isArray(items) || !items.length) {
      mount.innerHTML = `<p class="muted">No projects yet.</p>`;
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "project-list";
    items.forEach(p => {
      const slug   = p.slug || "";
      const href   = p.href || `${base}${slug}/`;
      const logo   = (p.logo || `${base}${slug}/logo.png`).replace("/_/logo.png", "/logo.png");
      const title  = p.title || slug || "Untitled";
      const blurb  = p.blurb || "";
      const github = p.github || "";

      const row = document.createElement("div");
      row.className = "project-row";
      row.innerHTML = `
        <a class="project-logo" href="${href}">
          <img src="${logo}" alt="${title} logo" width="64" height="64" loading="lazy" decoding="async"/>
        </a>
        <div class="project-meta">
          <h3><a href="${href}">${title}</a></h3>
          <p class="muted">${blurb}</p>
          <div class="links">
            <a class="btn" href="${href}">Open</a>
            ${github ? `<a class="btn ghost" href="${github}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ""}
          </div>
        </div>
      `;
      wrap.appendChild(row);
    });
    mount.appendChild(wrap);
  }

  async function boot() {
    CATEGORIES.forEach(({ mountId }) => {
      const m = document.getElementById(mountId);
      if (m) m.innerHTML = `<p class="loading">Loading…</p>`;
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

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", boot, { once: true })
    : boot();
})();
