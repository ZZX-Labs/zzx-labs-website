(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  function yearRow(year) {
    return WFB.state.archive?.years?.find((row) => Number(row.year) === Number(year)) || null;
  }

  function renderInspector(year) {
    const row = yearRow(year);
    WFB.state.selectedYear = Number(year);

    const set = (selector, value) => {
      const el = WFB.$(selector);
      if (el) el.textContent = value;
    };

    set("[data-wfb-selected-year]", year);
    set("[data-wfb-edition-status]", row?.status || "unresolved");
    set("[data-wfb-edition-providers]", row?.providers?.length ? row.providers.join(", ") : "—");
    set("[data-wfb-edition-pages]", WFB.format(row?.referencePages));
    set("[data-wfb-edition-power]", WFB.format(row?.electricityRecords));
    set("[data-wfb-edition-media]", WFB.format(row?.media));

    const note = WFB.$("[data-wfb-edition-note]");
    if (note) {
      note.textContent = row?.status === "indexed"
        ? "Full crawler index is available for this year."
        : row?.status === "partial"
          ? "Source evidence exists, but this checkout does not yet contain a complete normalized edition."
          : "No local source evidence has been indexed for this year yet. The interface does not invent missing coverage.";
    }

    WFB.$$(".wfb-year").forEach((button) => {
      button.classList.toggle("is-selected", Number(button.dataset.year) === Number(year));
    });
  }

  function init() {
    const archive = WFB.state.archive;
    const timeline = WFB.$("[data-wfb-timeline]");
    const yearSelect = WFB.$("[data-wfb-search-year]");
    if (!archive || !timeline) return;

    timeline.innerHTML = "";
    if (yearSelect) {
      yearSelect.innerHTML = '<option value="">All years</option>';
    }

    archive.years.forEach((row) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wfb-year";
      button.dataset.year = row.year;
      button.dataset.status = row.status;
      button.setAttribute("role", "listitem");
      button.textContent = row.year;
      button.title =
        row.year + " · " + row.status +
        " · providers " + (row.providers.length ? row.providers.join(", ") : "none indexed");
      button.addEventListener("click", () => renderInspector(row.year));
      timeline.appendChild(button);

      if (yearSelect) {
        const option = document.createElement("option");
        option.value = row.year;
        option.textContent = row.year;
        yearSelect.appendChild(option);
      }
    });

    const preferred =
      archive.years.slice().reverse().find((row) => row.status !== "unresolved")?.year ||
      archive.end;
    renderInspector(preferred);
  }

  WFB.timeline = Object.freeze({ init, renderInspector });
})();
