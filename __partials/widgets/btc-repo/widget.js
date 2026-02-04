// __partials/widgets/btc-repo/widget.js
// Unified-runtime adapter (NO UI / layout / behavior changes)
// Updated: uses btc-card wrapper + class-based styling (no inline styles)

(function () {
  "use strict";

  const W = window;
  const ID = "btc-repo";

  const GH = "https://api.github.com";
  const REPOS = [
    "bitcoin/bitcoin",
    "bitcoin/bips",
    "lightning/bolts",
    "lightningnetwork/lnd"
  ];

  let inflight = false;

  async function latestCommit(repo) {
    const r = await fetch(`${GH}/repos/${repo}/commits?per_page=1`, {
      cache: "no-store",
      headers: { "Accept": "application/vnd.github+json" }
    });
    if (!r.ok) throw new Error(`GH ${repo} HTTP ${r.status}`);
    const arr = await r.json();
    const c = Array.isArray(arr) ? arr[0] : null;

    const msg = String(c?.commit?.message || "").split("\n")[0].slice(0, 120);
    const url = c?.html_url || `https://github.com/${repo}`;

    return { repo, msg, url };
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function render(root, items) {
    const host = root.querySelector("[data-list]");
    if (!host) return;

    if (!items.length) {
      host.innerHTML = `<div class="zzx-repo-empty">no repo items</div>`;
      return;
    }

    host.innerHTML = items.map((it) => {
      const short = it.repo.split("/")[1] || it.repo;
      return (
        `<div class="zzx-repo-item">` +
          `<span class="zzx-repo-tag">${esc(short)}</span>` +
          `<a class="zzx-repo-link" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">` +
            `${esc(it.msg)}` +
          `</a>` +
        `</div>`
      );
    }).join("");
  }

  function boot(root) {
    if (!root) return;

    const state = (root.__zzxRepoState = root.__zzxRepoState || { last: 0 });

    async function update(force) {
      const now = Date.now();
      if (!force && now - state.last < 60_000) return;
      if (inflight) return;

      state.last = now;
      inflight = true;

      try {
        const idx = Math.floor(Date.now() / 60_000) % REPOS.length;
        const batch = [REPOS[idx], REPOS[(idx + 1) % REPOS.length]];

        const items = [];
        for (const repo of batch) {
          try { items.push(await latestCommit(repo)); }
          catch { /* ignore */ }
        }

        render(root, items);
      } finally {
        inflight = false;
      }
    }

    // store for tick() usage when registered via legacy runtime
    root.__zzxRepoUpdate = update;

    update(true);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, {
      mount(slotEl) { this._root = slotEl; },
      async start() { boot(this._root); },
      tick() {
        const root = this._root;
        if (root && typeof root.__zzxRepoUpdate === "function") root.__zzxRepoUpdate(false);
      },
      stop() {}
    });
  }
})();
