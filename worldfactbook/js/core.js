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
      WFB.readingRoom?.init?.();
      await WFB.dailyArchive?.init?.();
      await WFB.globe?.init?.();
      WFB.status?.init?.();
      WFB.search?.init?.();
      WFB.provenance?.init?.();

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
