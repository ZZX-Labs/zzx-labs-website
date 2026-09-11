(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  function set(selector, value) {
    const el = WFB.$(selector);
    if (el) el.textContent = value;
  }

  function init() {
    const archive = WFB.state.archive;
    if (!archive) return;

    const total = archive.end - archive.start + 1;
    const evidenced = archive.evidencedYears.length;
    const powerCount = Array.isArray(archive.powerRows) ? archive.powerRows.length : 0;
    const mediaCount = Array.isArray(archive.mediaRows) ? archive.mediaRows.length : 0;

    set("[data-wfb-stat-editions]", WFB.format(evidenced) + " / " + WFB.format(total));
    set("[data-wfb-stat-pages]", WFB.format(archive.referencePages.length));
    set("[data-wfb-stat-electricity]", WFB.format(powerCount));
    set("[data-wfb-stat-media]", archive.media ? WFB.format(mediaCount) : "pending crawler");

    const label = WFB.$("[data-wfb-live-label]");
    const dot = WFB.$("[data-wfb-live-dot]");
    if (label) {
      label.textContent = archive.portal
        ? "Full WorldFactbook portal index loaded"
        : "Compatibility archive loaded · full portal index pending";
    }
    dot?.classList.add("is-ready");
  }

  WFB.status = Object.freeze({ init });
})();
