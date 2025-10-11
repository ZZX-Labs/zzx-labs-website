// Projects · Software — logo-first cards (stable layout, 120x120 logos)
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

      const grid = document.createElement("div");
      grid.className = "cards-grid";
      listEl.appendChild(grid);
      items.forEach(p => renderCard(grid, p));
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<p class="error">Failed to load projects.</p>`;
    }
  }

  function renderCard(grid, p) {
    const slug = p.slug || "";
    const href = p.href || `/projects/software/${slug}/`;
    const logo = normalizeLogo(p.logo || `/projects/software/${slug}/logo.png`);
    const github = p.github || "";
    const title = p.title || slug || "Untitled";
    const blurb = p.blurb || "";

    const card = document.createElement("article");
    card.className = "card project-card";
    card.innerHTML = `
      <a class="card-media" href="${escAttr(href)}" aria-label="${escAttr(title)}">
        <img class="card-logo" src="${escAttr(logo)}" alt="${escAttr(title)} logo"
             width="120" height="120" loading="lazy" decoding="async" />
      </a>
      <div class="card-body">
        <h3 class="card-title"><a href="${escAttr(href)}">${escHtml(title)}</a></h3>
        <p class="card-blurb">${escHtml(blurb)}</p>
        <div class="card-cta">
          <a class="btn" href="${escAttr(href)}">Open</a>
          ${github ? `<a class="btn ghost" href="${escAttr(github)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : ""}
        </div>
      </div>
    `;

    const img = card.querySelector(".card-logo");
    img.addEventListener("error", () => {
      img.src = "/static/placeholder-logo.svg";
      img.classList.add("fallback");
    });

    grid.appendChild(card);
  }

  function escHtml(s){return String(s||"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
  function escAttr(s){return String(s||"").replace(/"/g,"&quot;");}
  function normalizeLogo(s){return String(s||"").replace("/_/logo.png","/logo.png");}
})();
