// __partials/widgets/btc-repo/widget.js
(function () {
  const Core = window.ZZXWidgetsCore;
  if (!Core) return;

  const GH = "https://api.github.com";
  const REPOS = ["bitcoin/bitcoin", "bitcoin/bips", "lightning/bolts", "lightningnetwork/lnd"];
  let inflight = false;

  async function latestCommit(repo) {
    const r = await fetch(`${GH}/repos/${repo}/commits?per_page=1`, {
      cache:"no-store",
      headers:{ "Accept":"application/vnd.github+json" }
    });
    if (!r.ok) throw new Error(`GH ${repo} HTTP ${r.status}`);
    const arr = await r.json();
    const c = Array.isArray(arr)?arr[0]:null;
    const msg = String(c?.commit?.message||"").split("\n")[0].slice(0,120);
    const url = c?.html_url || `https://github.com/${repo}`;
    return { repo, msg, url };
  }

  async function update(root) {
    if (inflight) return;
    inflight = true;
    try {
      const idx = Math.floor(Date.now()/60_000) % REPOS.length;
      const batch = [REPOS[idx], REPOS[(idx+1)%REPOS.length]];

      const items = [];
      for (const repo of batch) {
        try { items.push(await latestCommit(repo)); } catch (_) {}
      }

      const host = root.querySelector("[data-list]");
      if (!items.length) {
        host.textContent = "no repo items";
        return;
      }

      host.innerHTML = items.map(it =>
        `<div style="margin:.2rem 0;">
          <span style="color:#e6a42b;font-family:AdultSwimFont,IBMPlexMono,monospace;">${it.repo.split("/")[1]}</span>
          <a href="${it.url}" target="_blank" rel="noopener noreferrer" style="color:#c0d674;text-decoration:none;">
            ${it.msg}
          </a>
        </div>`
      ).join("");
    } finally {
      inflight = false;
    }
  }

  Core.onMount("btc-repo", (root) => {
    update(root);
    setInterval(()=>update(root), 60_000);
  });
})();
