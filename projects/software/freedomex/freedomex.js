(() => {
  "use strict";

  const editions = window.FREEDOMEX_EDITIONS || [];
  const UI = window.FreedomExUI;
  if (!UI || !editions.length) return;

  function visibleEditions() {
    return editions.filter((edition) => {
      const nationMatch = UI.state.nation === "all" || edition.nation === UI.state.nation;
      const modeMatch = UI.state.mode === "all" || edition.mode === UI.state.mode;
      return nationMatch && modeMatch;
    });
  }

  function card(edition) {
    const nationalLine = edition.nation === "canada" ? "GEWSE PROTOCOL // MAPLE SECTOR" : "KOBRA PROTOCOL // LIBERTY SECTOR";
    return `<article class="edition-card ${edition.nation} ${edition.mode}">
      <div class="edition-card-top"><span>${UI.escapeHtml(nationalLine)}</span><span class="edition-mode">${edition.modeLabel}</span></div>
      <div class="edition-card-body">
        <p class="kicker">${UI.escapeHtml(edition.signal)}</p>
        <h3>${UI.escapeHtml(edition.title)}</h3>
        <p>${UI.escapeHtml(edition.description)}</p>
        <dl><div><dt>MARKET</dt><dd>${edition.market}</dd></div><div><dt>CUSTODY</dt><dd>NONE</dd></div><div><dt>REGION</dt><dd>${UI.escapeHtml(edition.nationLabel)}</dd></div></dl>
      </div>
      <a class="edition-launch" href="${edition.path}">OPEN ${edition.title.toUpperCase()} <span aria-hidden="true">→</span></a>
    </article>`;
  }

  function render() {
    const visible = visibleEditions();
    const grid = document.getElementById("edition-grid");
    const count = document.getElementById("edition-count");
    const summary = document.getElementById("router-summary");
    grid.innerHTML = visible.length ? visible.map(card).join("") : '<p class="router-empty">No edition matches this route.</p>';
    count.textContent = `${visible.length} / ${editions.length}`;
    const nation = UI.state.nation === "all" ? "both jurisdictions" : UI.state.nation === "canada" ? "Canada" : "the United States";
    const mode = UI.state.mode === "all" ? "CEX and DEX" : UI.state.mode.toUpperCase();
    summary.textContent = visible.length ? `Showing ${mode} research ports for ${nation}.` : "Reset one filter to expose a research port.";
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.classList.toggle("active", UI.state[button.dataset.filter] === button.dataset.value);
      button.setAttribute("aria-pressed", button.classList.contains("active") ? "true" : "false");
    });
    UI.save();
  }

  UI.load();
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    UI.state[button.dataset.filter] = button.dataset.value;
    render();
  }));
  document.getElementById("random-edition")?.addEventListener("click", () => {
    const pool = visibleEditions().length ? visibleEditions() : editions;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    location.href = selected.path;
  });
  render();
})();
