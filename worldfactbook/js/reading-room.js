(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  const CHAPTERS = ["edition frontispiece", "introduction", "national symbols", "geography", "people and society", "environment",
    "government", "economy", "energy", "communications", "transportation",
    "military and security", "space", "terrorism", "transnational issues",
    "visual archive", "images charts and diagrams", "raw", "india imports exports and trade balance"];
  function chapterRank(section) {
    const title = (section.dataset.category || section.querySelector("h4")?.textContent || "").toLowerCase()
      .replace(/[^a-z0-9]+/g, " ").trim() || "";
    const index = CHAPTERS.indexOf(title);
    return index < 0 ? CHAPTERS.length : index;
  }

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
    const chapterLabel = document.querySelector("[data-wfb-reading-chapter-label]");
    const fields = document.querySelector("[data-wfb-reading-fields]");
    const countLabel = document.querySelector("[data-wfb-reading-count-label]");
    const integrity = document.querySelector("[data-wfb-reading-integrity]");
    let scheduled = false;
    let previousSections = [];
    let previousCode = null;
    let expandedEvidence = true;
    let evidenceNotice = null;
    let previousUnreviewed = null;
    let previousExpanded = null;

    function toggleEvidence() {
      expandedEvidence = !expandedEvidence;
      schedule();
    }

    function refresh() {
      scheduled = false;
      const selectedYear = yearInput.value;
      const selectedCode = countryInput.value || profile.dataset.waterCode || "";
      edition.textContent = `Edition ${selectedYear}`;
      year.textContent = selectedYear;
      code.textContent = selectedCode || "—";

      const unsorted = Array.from(profile.children).filter(node =>
        node.classList?.contains("wfb-country-section"));
      const sections = unsorted.map((node, index) => ({ node, index }))
        .sort((a, b) => chapterRank(a.node) - chapterRank(b.node) || a.index - b.index)
        .map(item => item.node);
      if (sections.some((node, index) => node !== unsorted[index])) {
        // Reorder the existing source nodes. No text, citations, or media are recreated.
        profile.append(...sections);
      }
      const notice = Array.from(profile.children).find(node =>
        node.classList?.contains("wfb-country-notice") &&
        node.textContent.includes("Provisional legacy transcription"));
      const unreviewed = Boolean(notice);
      if (notice !== evidenceNotice) {
        expandedEvidence = true;
        evidenceNotice = notice || null;
      }
      profile.classList.toggle("wfb-reading-unreviewed", unreviewed);
      profile.classList.toggle("is-open", unreviewed && expandedEvidence);
      const fieldCount = profile.querySelectorAll(".wfb-country-field").length;
      const excerptCount = profile.querySelectorAll(".wfb-country-section > pre, .wfb-feed-excerpt").length;
      chapters.textContent = sections.length ? String(sections.length) : "—";
      if (chapterLabel) chapterLabel.textContent = unreviewed ? "Candidate sections" : "Sections";
      countLabel.textContent = unreviewed ? "Unreviewed fragments" : "Fields";
      fields.textContent = fieldCount || excerptCount ? String(fieldCount || excerptCount) : "—";
      if (integrity) {
        integrity.hidden = !unreviewed;
        integrity.textContent = unreviewed ?
          "Source fragments only. Country and edition assignments have not been verified; do not treat these as facts for the selected year." : "";
      }
      if (unreviewed && notice && !notice.querySelector("[data-wfb-evidence-toggle]")) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("data-wfb-evidence-toggle", "");
        button.addEventListener("click", toggleEvidence);
        notice.append(button);
      }
      const evidenceButton = notice?.querySelector("[data-wfb-evidence-toggle]");
      if (evidenceButton) {
        evidenceButton.textContent = expandedEvidence ? "Hide source fragments" :
          `Inspect ${excerptCount} unreviewed source fragment${excerptCount === 1 ? "" : "s"}`;
        evidenceButton.setAttribute("aria-expanded", String(expandedEvidence));
      }

      empty.hidden = profile.childElementCount > 0;
      if (!empty.hidden) {
        empty.querySelector("h4").textContent = selectedCode ? "Record awaiting source data" : "Explore an edition";
        empty.querySelector("p").textContent = selectedCode
          ? (status?.textContent || "Checking the available edition record for this location.")
          : "Select a location on the globe or from the location list. Then move the year fader to read the available country record.";
      }

      const visible = unreviewed && !expandedEvidence ?
        sections.filter(section => section.classList.contains("wfb-trade")) : sections;
      // The globe owns each record. Only its existing chapter nodes move here.
      if (selectedCode === previousCode && unreviewed === previousUnreviewed &&
          expandedEvidence === previousExpanded && visible.length === previousSections.length &&
          visible.every((node, i) => node === previousSections[i])) return;
      previousCode = selectedCode;
      previousUnreviewed = unreviewed;
      previousExpanded = expandedEvidence;
      previousSections = visible;
      nav.replaceChildren();
      if (!visible.length) {
        const hint = document.createElement("p");
        hint.textContent = unreviewed ? "Use Inspect source fragments to examine unverified material." :
          selectedCode ? "Sections appear here when source material is available." :
          "Choose a location to browse its sections.";
        nav.append(hint);
        return;
      }
      visible.forEach((section, index) => {
        const heading = section.querySelector("h4");
        if (!heading) return;
        if (!section.id) section.id = `wfb-record-section-${index + 1}`;
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
