/* __partials/credits/credits.js */
/* Pure, defensive, zero-side-effects credits renderer */
/* Does NOT touch widgets, HUD, ticker, or global JS state */

(function () {
  // prevent double init
  if (window.__ZZX_CREDITS_BOOTED) return;
  window.__ZZX_CREDITS_BOOTED = true;

  function createCredits() {
    const el = document.createElement("div");
    el.className = "zzx-credits";
    el.setAttribute("aria-label", "Site credits");

    // safe defaults
    const author = "0xdeadbeef";
    const year = new Date().getFullYear();

    el.innerHTML = `
      <span class="zzx-credits__label">Made by</span>
      <span class="zzx-credits__sep">·</span>
      <a class="zzx-credits__author" href="#" rel="author noopener">${author}</a>
      <span class="zzx-credits__sep">·</span>
      <span class="zzx-credits__meta">© ${year}</span>
    `;

    return el;
  }

  function mount() {
    // Preferred mount targets in order
    const targets = [
      document.getElementById("zzx-footer"),
      document.querySelector("footer"),
      document.body
    ].filter(Boolean);

    if (!targets.length) return;

    const credits = createCredits();

    // Avoid duplicates
    if (document.querySelector(".zzx-credits")) return;

    targets[0].appendChild(credits);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
