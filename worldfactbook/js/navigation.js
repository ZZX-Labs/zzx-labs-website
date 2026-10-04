(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  function setOpen(open) {
    const nav = WFB.$("#wfb-main-nav");
    const button = WFB.$(".wfb-menu-button");
    if (nav) nav.classList.toggle("is-open", open);
    if (button) button.setAttribute("aria-expanded", String(open));
  }

  function markActive(id) {
    WFB.$$("#wfb-main-nav a[href^='#']").forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === "#" + id);
    });
  }

  function init() {
    const button = WFB.$(".wfb-menu-button");
    const nav = WFB.$("#wfb-main-nav");

    if (button && nav && !button.dataset.ready) {
      button.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
      nav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => setOpen(false));
      });
      button.dataset.ready = "true";
    }

    WFB.$$("[data-wfb-scroll]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = WFB.$(button.dataset.wfbScroll);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    const sections = WFB.$$("main section[id]");
    if ("IntersectionObserver" in window && sections.length) {
      const observer = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) markActive(visible.target.id);
      }, { rootMargin: "-20% 0px -68% 0px", threshold: [0.05, 0.2, 0.5] });

      sections.forEach((section) => observer.observe(section));
    }
  }

  WFB.navigation = Object.freeze({ init });
})();
