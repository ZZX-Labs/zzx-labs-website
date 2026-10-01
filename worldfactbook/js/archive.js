(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  async function init() {
    const archive = await WFB.api.loadArchive();
    WFB.state.archive = archive;
    WFB.state.referencePages = archive.referencePages;

    const evidenced = archive.evidencedYears.length;
    const total = archive.end - archive.start + 1;

    const summary = WFB.$("[data-wfb-archive-summary]");
    if (summary) {
      summary.textContent = evidenced + " of " + total +
        " year slots have source candidates. Country and edition assignments require review; this count does not establish complete profiles.";
    }

    const generated = WFB.$("[data-wfb-generated]");
    if (generated) {
      generated.textContent = archive.generatedAt
        ? "Latest local archive generation: " + archive.generatedAt
        : "Archive generation timestamp unavailable";
    }

    WFB.dispatch("wfb:archive-ready", { archive });
    return archive;
  }

  WFB.archive = Object.freeze({ init });
})();
