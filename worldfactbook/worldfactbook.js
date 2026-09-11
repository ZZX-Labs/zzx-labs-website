(function () {
  "use strict";

  const W = window;
  if (W.ZZXWorldFactbook && W.ZZXWorldFactbook.__version >= 2) return;

  const current = document.currentScript;
  const root = new URL("./", current && current.src ? current.src : location.href);
  const apiRoot = new URL("./api/", root);
  const cache = new Map();

  const CONFIG = Object.freeze({
    name: "ZZX-WorldFactbook",
    historicalStart: 1962,
    historicalEnd: 2025,
    historicalInstitution: "Central Intelligence Agency",
    historicalPublication: "The World Factbook",
    variants: Object.freeze([
      "ZZX-WorldFactbook",
      "ZZX-BritishWorldFactbook",
      "ZZX-GlobalWorldFactbook",
      "ZZX-HybridWorldFactbook"
    ]),
    featureEndpoints: Object.freeze({
      leaders: "leaders/index.json",
      facts: "facts-of-the-day/index.json",
      images: "images-of-the-day/index.json"
    })
  });

  function clean(path) {
    return String(path || "").replace(/\\/g, "/").replace(/^\.?\//, "");
  }

  function url(path) {
    return new URL(clean(path), apiRoot).href;
  }

  function assetURL(path) {
    const cleanPath = clean(path);
    return cleanPath.startsWith("worldfactbook/")
      ? new URL(cleanPath.slice("worldfactbook/".length), root).href
      : new URL(cleanPath, root).href;
  }

  async function fetchJSON(target, options) {
    const opts = options || {};
    const absolute = /^https?:/i.test(String(target || "")) ? String(target) : url(target);
    if (!opts.refresh && cache.has(absolute)) return cache.get(absolute);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(opts.timeout || 18000));

    try {
      const response = await fetch(absolute, {
        cache: opts.refresh ? "no-store" : "default",
        credentials: "same-origin",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        const error = new Error("HTTP " + response.status + " for " + absolute);
        error.status = response.status;
        throw error;
      }

      const payload = await response.json();
      cache.set(absolute, payload);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function optionalJSON(path, options) {
    try {
      return await fetchJSON(path, options);
    } catch (error) {
      if (error && error.status === 404) return null;
      throw error;
    }
  }

  const api = {
    portalIndex: (options) => fetchJSON("portal-index.json", options),
    sourceIndex: (options) => fetchJSON("source-index.json", options),
    referenceIndex: (options) => fetchJSON("reference-index.json", options),
    electricity: (options) => fetchJSON("electricity-history.json", options),
    mediaIndex: (options) => fetchJSON("media-index.json", options),
    leaders: (options) => fetchJSON(CONFIG.featureEndpoints.leaders, options),
    facts: (options) => fetchJSON(CONFIG.featureEndpoints.facts, options),
    images: (options) => fetchJSON(CONFIG.featureEndpoints.images, options),
    optionalJSON
  };

  W.ZZXWorldFactbook = Object.freeze({
    __version: 2,
    root: root.href,
    apiRoot: apiRoot.href,
    config: CONFIG,
    url,
    apiURL: url,
    assetURL,
    fetchJSON,
    optionalJSON,
    api,
    portalIndex: api.portalIndex,
    sourceIndex: api.sourceIndex,
    referenceIndex: api.referenceIndex,
    electricity: api.electricity,
    mediaIndex: api.mediaIndex,
    clearCache: () => cache.clear()
  });
})();
