(function () {
  "use strict";

  const MODULES = [
    "js/base.js",
    "js/api.js",
    "js/partials.js",
    "js/navigation.js",
    "js/archive.js",
    "js/timeline.js",
    "js/status.js",
    "js/leaders.js",
    "js/daily-fact.js",
    "js/daily-image.js",
    "js/search.js",
    "js/hybrid.js",
    "js/provenance.js",
    "js/core.js"
  ];

  function root() {
    const script = document.currentScript;
    if (script && script.src) return new URL("./", script.src);
    return new URL("./", location.href);
  }

  function loaded(path) {
    return document.querySelector('script[data-wfb-module="' + path + '"]');
  }

  function load(path) {
    if (loaded(path)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = new URL(path, root()).href;
      el.defer = true;
      el.dataset.wfbModule = path;
      el.onload = resolve;
      el.onerror = () => reject(new Error("Failed to load WorldFactbook module: " + path));
      document.head.appendChild(el);
    });
  }

  async function boot() {
    try {
      for (const path of MODULES) await load(path);
      await window.WFBCore?.init?.();
      document.documentElement.classList.add("wfb-modules-loaded");
    } catch (error) {
      console.error("[ZZX-WorldFactbook] module boot failed:", error);
      const label = document.querySelector("[data-wfb-live-label]");
      const dot = document.querySelector("[data-wfb-live-dot]");
      if (label) label.textContent = "WorldFactbook module load failure";
      if (dot) dot.classList.add("is-error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
