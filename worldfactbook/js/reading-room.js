(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  function init() {
    const profile = document.querySelector("[data-wfb-country-profile]");
    const nav = document.querySelector("[data-wfb-reading-nav]");
    const empty = document.querySelector("[data-wfb-reading-empty]");
    const yearInput = document.querySelector("[data-wfb-globe-slider]");
    const countryInput = document.querySelector("[data-wfb-globe-country]");
    const status = document.querySelector("[data-wfb-country-status]");
    if (!profile || !nav || !empty || !yearInput || !countryInput) return;

    const edition = document.querySelector("[data-wfb-reading-edition]");
    const year = document.querySelector("[data-wfb-reading-year]");
    const code = document.querySelector("[data-wfb-reading-code]");
    const chapters = document.querySelector("[data-wfb-reading-chapters]");
    const fields = document.querySelector("[data-wfb-reading-fields]");
    const countLabel = document.querySelector("[data-wfb-reading-count-label]");
    let scheduled = false;
    let previousSections = [];
    let previousCode = null;

    function refresh() {
      scheduled = false;
      const selectedYear = yearInput.value;
      const selectedCode = countryInput.value;
      edition.textContent = `Edition ${selectedYear}`;
      year.textContent = selectedYear;
      code.textContent = selectedCode || "—";

      const sections = Array.from(profile.children).filter(node =>
        node.classList?.contains("wfb-country-section"));
      const fieldCount = profile.querySelectorAll(".wfb-country-field").length;
      const excerptCount = profile.querySelectorAll(".wfb-country-section > pre").length;
      chapters.textContent = sections.length ? String(sections.length) : "—";
      countLabel.textContent = excerptCount && !fieldCount ? "Excerpts" : "Fields";
      fields.textContent = fieldCount || excerptCount ? String(fieldCount || excerptCount) : "—";

      empty.hidden = profile.childElementCount > 0;
      if (!empty.hidden) {
        empty.querySelector("h4").textContent = selectedCode ? "Record awaiting source data" : "Explore an edition";
        empty.querySelector("p").textContent = selectedCode
          ? (status?.textContent || "Checking the available edition record for this location.")
          : "Select a location on the globe or from the location list. Then move the year fader to read the available country record.";
      }

      // The globe owns the record. This component only adds navigation and typography.
      // Avoid rebuilding the rail when a separate India trade request appends a section.
      if (selectedCode === previousCode && sections.length === previousSections.length &&
          sections.every((node, i) => node === previousSections[i])) return;
      previousCode = selectedCode;
      previousSections = sections;
      nav.replaceChildren();
      if (!sections.length) {
        const hint = document.createElement("p");
        hint.textContent = selectedCode ? "Sections appear here when source material is available." :
          "Choose a location to browse its sections.";
        nav.append(hint);
        return;
      }
      sections.forEach((section, index) => {
        const heading = section.querySelector(":scope > h4");
        if (!heading) return;
        section.id = `wfb-record-section-${index + 1}`;
        section.style.setProperty("--wfb-reading-number", `"${String(index + 1).padStart(2, "0")}"`);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wfb-reading-nav-item";
        button.setAttribute("aria-label", `Jump to ${heading.textContent.trim()}`);
        const number = document.createElement("span");
        number.textContent = String(index + 1).padStart(2, "0");
        const label = document.createElement("span");
        label.textContent = heading.textContent.trim();
        button.append(number, label);
        button.addEventListener("click", () => {
          nav.querySelectorAll("button").forEach(item => item.removeAttribute("aria-current"));
          button.setAttribute("aria-current", "location");
          section.scrollIntoView({
            behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
            block: "start"
          });
        });
        nav.append(button);
      });
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    new MutationObserver(schedule).observe(profile, { childList: true });
    if (status) new MutationObserver(schedule).observe(status, {
      childList: true, characterData: true, subtree: true
    });
    for (const input of [yearInput, countryInput]) {
      input.addEventListener("input", schedule);
      input.addEventListener("change", schedule);
    }
    refresh();
  }

  WFB.readingRoom = Object.freeze({ init });
})();
