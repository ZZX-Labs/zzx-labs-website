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
    if (!latest || !readout) return;
    readout.classList.remove("wfb-image-placeholder");
    readout.classList.add("wfb-feature-readout");
    readout.replaceChildren();
    if (latest.image_url) {
      const img = document.createElement("img");
      img.src = latest.image_url;
      img.alt = WFB.text(latest.alt || latest.caption, "Historical World Factbook Image of the Day");
      img.loading = "lazy";
      img.decoding = "async";
      img.className = "wfb-daily-image";
      readout.append(img);
    }
    const strong = document.createElement("strong");
    strong.textContent = WFB.text(latest.caption || latest.alt, "Indexed historical image");
    readout.append(strong);
    if (latest.date) {
      const meta = document.createElement("span");
      meta.textContent = String(latest.date);
      readout.append(meta);
    }
  }
  WFB.dailyImage = Object.freeze({ init });
})();
