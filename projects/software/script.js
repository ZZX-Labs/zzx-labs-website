// Projects · Software — logo-first cards (stable layout, 120x120 logos) + search
(function () {
  const listEl = document.getElementById("projects-list");

  const state = {
    all: [],
    filtered: [],
  };

  boot();

  async function boot() {
    try {
      listEl.innerHTML = `<p class="loading">Loading projects…</p>`;
      const res = await fetch("./manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const items = Array.isArray(data?.projects) ? data.projects : [];

      // Assign manifest order index (1..N)
      state.all = items.map((raw, i) => normalizeItem(raw, i));
      listEl.innerHTML = "";
      renderUI();
    } catch (e) {
      console.error(e);
      listEl.innerHTML = `<p class="error">Failed to load projects.</p>`;
    }
  }

  function renderUI() {
    // Search control
    const filterWrap = document.createElement("div");
    filterWrap.className = "container";
    filterWrap.style.marginBottom = ".75rem";

    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Filter by title, slug, blurb, or tags…";
    input.autocomplete = "off";
    Object.assign(input.style, {
      width: "100%",
      padding: ".55rem .75rem",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,.16)",
      background: "rgba(255,255,255,.04)",
      color: "#e8e8e8",
    });
    filterWrap.appendChild(input);
    listEl.appendChild(filterWrap);

    // Grid
    const grid = document.createElement("div");
    grid.className = "cards-grid";
    listEl.appendChild(grid);

    const draw = (rows) => {
      grid.innerHTML = "";
      if (!rows.length) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = "No matching projects.";
        p.style.gridColumn = "1/-1";
        grid.appendChild(p);
        return;
      }
      const frag = document.createDocumentFragment();
      rows.forEach((p) => frag.appendChild(buildCard(p)));
      grid.appendChild(frag);
    };

    // Initial render (no filter)
    state.filtered = state.all;
    draw(state.filtered);

    // Debounced filter
    const onFilter = debounce(() => {
      const q = (input.value || "").trim().toLowerCase();
      if (!q) {
        state.filtered = state.all;
      } else {
        const terms = q.split(/\s+/).filter(Boolean);
        state.filtered = state.all.filter((p) =>
          terms.every((t) => p.__search.includes(t))
        );
      }
      draw(state.filtered);
    }, 120);

    input.addEventListener("input", onFilter);
  }

  function buildCard(p) {
    const card = document.createElement("article");
    card.className = "card project-card";

    // Zero-padded manifest index (001, 002, …)
    const count = String(Number(p.__idx || 0)).padStart(4, "0");

    card.innerHTML = `
      <div class="card-count" aria-hidden="true">${count}</div>

      <a class="card-media" href="${escAttr(p.href)}" aria-label="${escAttr(p.title)}">
        <img class="card-logo"
             src="${escAttr(p.logo)}"
             alt="${escAttr(p.title)} logo"
             width="120"
             height="120"
             loading="lazy"
             decoding="async" />
      </a>

      <div class="card-body">
        <h3 class="card-title">
          <a href="${escAttr(p.href)}">${escHtml(p.title)}</a>
        </h3>
        <p class="card-blurb">${escHtml(p.blurb)}</p>
        <div class="card-cta">
          <a class="btn" href="${escAttr(p.href)}">Open</a>
          ${
            p.github
              ? `<a class="btn ghost" href="${escAttr(
                  p.github
                )}" target="_blank" rel="noopener noreferrer">GitHub</a>`
              : ""
          }
        </div>
      </div>
    `;

    const img = card.querySelector(".card-logo");
    img.addEventListener("error", () => {
      img.src = "/static/placeholder-logo.svg";
      img.classList.add("fallback");
    });

    return card;
  }

  // ---------- helpers ----------

  function normalizeItem(p, i) {
    const slug   = p.slug || "";
    const href   = p.href || (slug ? `/projects/software/${slug}/` : "#");
    const title  = p.title || slug || "Untitled";
    const blurb  = p.blurb || "";
    const logo   = normalizeLogo(
      p.logo || (slug
        ? `/projects/software/${slug}/logo.png`
        : "/static/placeholder-logo.svg")
    );
    const github = p.github_url || p.github || "";
    const tags   = Array.isArray(p.tags) ? p.tags : [];

    const search = [title, slug, blurb, tags.join(" ")].join(" ").toLowerCase();

    // Stable manifest index (1..N)
    const __idx = i + 1;

    return {
      slug,
      href,
      title,
      blurb,
      logo,
      github,
      tags,
      __search: search,
      __idx,
    };
  }

  function escHtml(s) {
    return String(s || "").replace(/[&<>]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])
    );
  }

  function escAttr(s) {
    return String(s || "").replace(/"/g, "&quot;");
  }

  function normalizeLogo(s) {
    return String(s || "").replace("/_/logo.png", "/logo.png");
  }

  function debounce(fn, ms = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
})();
