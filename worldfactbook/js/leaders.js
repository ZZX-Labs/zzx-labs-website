(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  async function init() {
    const badge = WFB.$("[data-wfb-leaders-status]");
    const readout = WFB.$("[data-wfb-leaders-readout]");
    const payload = await WFB.api.probe("leaders/index.json");

    if (!payload) {
      badge?.classList.add("is-pending");
      if (badge) badge.textContent = "preservation index pending";
      if (readout) readout.textContent =
        "No leaders/index.json contract exists in this checkout yet. Historical and current leadership data will remain date-stamped and source-cited.";
      return;
    }

    badge?.classList.add("is-ready");
    if (badge) badge.textContent = "index available";
    const count = Array.isArray(payload.records) ? payload.records.length : Number(payload.record_count || 0);
    if (readout) readout.textContent = WFB.format(count) + " leadership records indexed.";
  }

  WFB.leaders = Object.freeze({ init });
})();
