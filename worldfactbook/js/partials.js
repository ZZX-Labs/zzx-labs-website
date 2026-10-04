(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  async function inject(targetSelector, path) {
    const target = WFB.$(targetSelector);
    if (!target) return false;

    try {
      const response = await fetch(new URL(path, window.ZZXWorldFactbook.root), {
        cache: "default",
        credentials: "same-origin"
      });

      if (!response.ok) throw new Error("HTTP " + response.status);
      target.innerHTML = await response.text();
      return true;
    } catch (error) {
      console.warn("[WFB partial]", path, error);
      return false;
    }
  }

  async function init() {
    await Promise.all([
      inject("#wfb-header", "includes/header.html"),
      inject("#wfb-footer", "includes/footer.html")
    ]);
    WFB.dispatch("wfb:partials-ready");
  }

  WFB.partials = Object.freeze({ init });
})();
