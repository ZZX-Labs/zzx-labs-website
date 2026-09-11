(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  async function init() {
    await WFB.partials?.init?.();
    WFB.navigation?.init?.();

    try {
      await WFB.archive?.init?.();
      WFB.timeline?.init?.();
      WFB.status?.init?.();
      WFB.search?.init?.();
      WFB.provenance?.init?.();

      await Promise.all([
        WFB.leaders?.init?.(),
        WFB.dailyFact?.init?.(),
        WFB.dailyImage?.init?.()
      ]);

      WFB.hybrid?.init?.();
      WFB.dispatch("wfb:ready", { archive: WFB.state.archive });
    } catch (error) {
      console.error("[ZZX-WorldFactbook] initialization failed:", error);
      const label = WFB.$("[data-wfb-live-label]");
      const dot = WFB.$("[data-wfb-live-dot]");
      if (label) label.textContent = "Archive API unavailable";
      dot?.classList.add("is-error");
    }
  }

  window.WFBCore = Object.freeze({ init });
})();
