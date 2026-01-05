// static/js/credits-modal.js  (DROP-IN NEW FILE)
// Loads /__partials/credits/ into modal, closes on X, Esc, or backdrop click.
(() => {
  const btn   = document.getElementById("footer-credits-btn");
  const modal = document.getElementById("zzx-credits-modal");
  const body  = document.getElementById("zzx-credits-body");
  const xBtn  = modal ? modal.querySelector(".zzx-credits-x") : null;

  if (!btn || !modal || !body) return;

  let loaded = false;

  function open() {
    modal.hidden = false;
    document.body.classList.add("no-scroll");

    // lazy-load credits once
    if (!loaded) {
      loaded = true;
      fetch("/__partials/credits/", { cache: "no-store" })
        .then(r => {
          if (!r.ok) throw new Error(`credits HTTP ${r.status}`);
          return r.text();
        })
        .then(html => {
          body.innerHTML = html;
        })
        .catch(err => {
          body.innerHTML =
            `<div class="zzx-credits-loading">Failed to load credits: ${String(err?.message || err)}</div>`;
        });
    }

    (xBtn || btn).focus?.();
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove("no-scroll");
    btn.focus?.();
  }

  btn.addEventListener("click", open);
  xBtn && xBtn.addEventListener("click", close);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close(); // backdrop click
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });
})();
