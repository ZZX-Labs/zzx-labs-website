(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  async function init() {
    const badge = WFB.$("[data-wfb-image-status]");
    const readout = WFB.$("[data-wfb-image-readout]");
    const payload = await WFB.api.probe("images-of-the-day/index.json");

    if (!payload) {
      badge?.classList.add("is-pending");
      if (badge) badge.textContent = "historical feed pending";
      return;
    }

    badge?.classList.add("is-ready");
    if (badge) badge.textContent = "archive available";

    const images = Array.isArray(payload.images) ? payload.images : (Array.isArray(payload.records) ? payload.records : []);
    const latest = images[images.length - 1];

    if (latest && readout) {
      readout.innerHTML = "";
      const span = document.createElement("span");
      span.textContent = "LATEST INDEXED IMAGE";
      const strong = document.createElement("strong");
      strong.textContent = WFB.text(latest.caption || latest.title || latest.citation_key, "Indexed archive image");
      readout.append(span, strong);
    }
  }

  WFB.dailyImage = Object.freeze({ init });
})();
