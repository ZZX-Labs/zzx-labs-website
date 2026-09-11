(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  async function init() {
    const badge = WFB.$("[data-wfb-fact-status]");
    const readout = WFB.$("[data-wfb-fact-readout]");
    const payload = await WFB.api.probe("facts-of-the-day/index.json");

    if (!payload) {
      badge?.classList.add("is-pending");
      if (badge) badge.textContent = "historical feed pending";
      return;
    }

    badge?.classList.add("is-ready");
    if (badge) badge.textContent = "archive available";

    const facts = Array.isArray(payload.facts) ? payload.facts : (Array.isArray(payload.records) ? payload.records : []);
    const latest = facts[facts.length - 1];

    if (latest && readout) {
      readout.textContent = WFB.text(latest.fact || latest.text || latest.content, "Historical Fact of the Day record loaded.");
    }
  }

  WFB.dailyFact = Object.freeze({ init });
})();
