// Projects · Software — listing boot
// Loads ./manifest.json and renders logo-first cards.

(function () {
  const listEl = document.getElementById("projects-list");

  boot();

  async function boot() {
    try {
      const res = await fetch("./manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const items = Array.isArray(data?.projects) ? data.projects : [];

      listEl.innerHTML = "";
      if (!items.length) {
        listEl.innerHTML = `<p class="muted">No projects yet.</p>`;
        return;
      }

      // Grid container
      const grid = document.createElement("div");
      grid.className = "cards-grid";
      listEl.appendChild(grid);

      items.forEach(renderCard.bind(null, grid));
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<p class="error">Failed to load projects.</p>`;
    }
  }

  function renderCard(grid, p) {
    const slug = p.slug || "";
    const href = p.href || `/projects/software/${slug}/`;
    const logo = cleanLogo(p.logo || `/projects/software/${slug}/logo.png`);
    const github = p.github || "";
    const title = p.title || slug || "Untitled";
    const blurb = p.blurb || "";

    const card = document.createElement("article");
    card.className = "card project-card";

    card.innerHTML = `
      <a class="card-media" href="${escapeAttr(href)}" aria-label="${escapeAttr(title)}">
        <img class="card-logo" src="${escapeAttr(logo)}" alt="${escapeAttr(title)} logo" loading="lazy" decoding="async" />
      </a>
      <div class="card-body">
        <h3 class="card-title"><a href="${escapeAttr(href)}">${escapeHtml(title)}</a></h3>
        <p class="card-blurb">${escapeHtml(blurb)}</p>
        <div class="card-cta">
          <a class="btn" href="${escapeAttr(href)}">Open</a>
          ${github ? `<a class="btn ghost" href="${escapeAttr(github)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ""}
        </div>
      </div>
    `;

    // Fallback image on error
    const img = card.querySelector(".card-logo");
    img.addEventListener("error", () => {
      img.src = "/static/placeholder-logo.svg";
      img.classList.add("fallback");
    });

    grid.appendChild(card);
  }

  // --- tiny utils ---
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }
  function escapeAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
  }
  function cleanLogo(s) {
    // normalize accidental underscores or missing slashes if any drifted in
    return String(s || "").replace("/_/logo.png", "/logo.png");
  }
})();
