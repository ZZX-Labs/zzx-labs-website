(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  const labels = {
    cia: "CIA historical core",
    uk: "British public-source supplement",
    multilateral: "UN / World Bank / IMF / NATO",
    national: "National official-source layer"
  };

  function render() {
    const era = WFB.$("[data-wfb-hybrid-era]")?.value || "full";
    const style = WFB.$("[data-wfb-hybrid-style]")?.value || "classic";
    const sources = WFB.$$("[data-wfb-hybrid-source]:checked").map((input) => labels[input.value] || input.value);
    const target = WFB.$("[data-wfb-hybrid-recipe]");
    if (!target) return;

    const recipe = {
      product: "ZZX-HybridWorldFactbook",
      historical_basis: era,
      source_families: sources,
      editorial_mode: style,
      generation: "TensorFlow-assisted, retrieval-grounded",
      factual_policy: "claims must resolve to dated source records",
      citation_policy: "source family + source URL/id + observation/edition date",
      output_label: "generated ZZX synthesis — never historical CIA original"
    };

    target.textContent = JSON.stringify(recipe, null, 2);
  }

  function init() {
    WFB.$$("[data-wfb-hybrid-era], [data-wfb-hybrid-style], [data-wfb-hybrid-source]")
      .forEach((input) => input.addEventListener("change", render));
    render();
  }

  WFB.hybrid = Object.freeze({ init, render });
})();
