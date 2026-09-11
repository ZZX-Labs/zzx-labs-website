(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  function haystack(row) {
    return [
      row.country,
      row.country_name,
      row.source_entity,
      row.provider,
      row.item_identifier,
      row.item_url,
      row.container_url,
      row.inner_path,
      row.source_url,
      row.edition_year
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function render() {
    const input = WFB.$("[data-wfb-search]");
    const yearSelect = WFB.$("[data-wfb-search-year]");
    const results = WFB.$("[data-wfb-search-results]");
    if (!input || !results) return;

    const query = input.value.trim().toLowerCase();
    const year = yearSelect?.value || "";

    if (!query && !year) {
      results.innerHTML = '<div class="wfb-placeholder">Search the recovered reference index.</div>';
      return;
    }

    const rows = (WFB.state.referencePages || []).filter((row) => {
      if (year && String(row.edition_year) !== String(year)) return false;
      if (query && !haystack(row).includes(query)) return false;
      return true;
    }).slice(0, 24);

    results.innerHTML = "";

    if (!rows.length) {
      results.innerHTML = '<div class="wfb-placeholder">No matching source-index records in this checkout.</div>';
      return;
    }

    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "wfb-search-hit";

      const yearNode = document.createElement("span");
      yearNode.textContent = WFB.text(row.edition_year);

      const name = document.createElement("strong");
      name.textContent = WFB.text(row.country_name || row.country || row.source_entity, "Unknown entity");

      const detail = document.createElement("small");
      detail.textContent = [
        row.provider,
        row.item_identifier,
        row.inner_path
      ].filter(Boolean).join(" · ");

      const link = document.createElement("a");
      link.textContent = row.source_url || row.item_url ? "source" : "indexed";
      if (row.source_url || row.item_url) {
        link.href = row.source_url || row.item_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }

      item.append(yearNode, name, detail, link);
      results.appendChild(item);
    });
  }

  function init() {
    const input = WFB.$("[data-wfb-search]");
    const year = WFB.$("[data-wfb-search-year]");
    if (!input) return;

    let timer = 0;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(render, 100);
    });
    year?.addEventListener("change", render);
  }

  WFB.search = Object.freeze({ init, render });
})();
