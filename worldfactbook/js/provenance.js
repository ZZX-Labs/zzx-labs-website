(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  function init() {
    const archive = WFB.state.archive;
    const grid = WFB.$("[data-wfb-provenance-grid]");
    if (!archive || !grid) return;

    const providers = WFB.unique(
      (archive.references?.editions || []).map((row) => row.provider)
        .concat((archive.references?.pages || []).map((row) => row.provider))
        .concat((archive.powerRows || []).map((row) => row.source_provider))
    );

    if (providers.length) {
      grid.dataset.providers = providers.join(",");
      grid.title = "Current indexed providers: " + providers.join(", ");
    }
  }

  WFB.provenance = Object.freeze({ init });
})();
