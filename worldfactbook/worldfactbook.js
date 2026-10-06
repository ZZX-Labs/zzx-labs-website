(function () {
  "use strict";

  const W = window;
  if (W.ZZXWorldFactbook && W.ZZXWorldFactbook.__version >= 2) return;

  const current = document.currentScript;
  const root = new URL("./", current && current.src ? current.src : location.href);
  const apiRoot = new URL("./api/", root);
  const cache = new Map(), cachedAt = new Map();

  let archiveConfig;
  function safePath(path) {
    const value = String(path || "").replace(/\\/g, "/")
      .replace(/^worldfactbook\//, "").replace(/^\.\//, "");
    if (!value || value.startsWith("/") || /[?#%:\x00-\x1f]/.test(value) ||
        value.split("/").some(part => !part || part === "." || part === "..")) {
      throw Error("Invalid archive resource path");
    }
    return value;
  }
  function resourceYear(path) {
    const value = safePath(path);
    const patterns = [
      /^api\/(?:editions|media|attributions|facts-of-the-day|images-of-the-day|legacy-features)\/(\d{4})(?:\/|\.)/,
      /^api\/(?:verified-html|country-archive|leaders)\/countries\/[^/]+\/(\d{4})(?:\/|\.)/,
      /^api\/(?:country-archive|web-archive|india-trade)\/(?:years|editions)\/(\d{4})(?:\/|\.)/,
      /^api\/(?:leaders|flags|images-of-the-day|facts-of-the-day|places-of-the-day|legacy-features)\/years\/(\d{4})(?:\/|\.)/,
      /^api\/daily-archive\/months\/(\d{4})-\d{2}\.json$/,
      /^boundaries\/(?:water\/)?editions\/(\d{4})\//,
      /^(?:media|manual)\/(?:[^/]+\/)?(\d{4})(?:\/|\.)/
    ];
    for (const pattern of patterns) { const match = value.match(pattern); if (match) return Number(match[1]); }
    return null;
  }
  async function config() {
    if (!archiveConfig) archiveConfig = fetchJSON(new URL("archive-config.json", root).href,
      {timeout:5000}).catch(() => ({enabled:false}));
    return archiveConfig;
  }
  async function resourceURL(path) {
    const value = safePath(path), settings = await config(), year = resourceYear(value);
    if (!settings.enabled || (!year && !value.startsWith("api/") && !/^(?:boundaries|boundaries\/water)\/manifest\.json$/.test(value))) return new URL(value, root).href;
    const endpoint = new URL(settings.api_base || "/worldfactbook-data/", root);
    if (endpoint.username || endpoint.password ||
        (endpoint.protocol !== "https:" && endpoint.origin !== new URL(root).origin)) {
      throw Error("Archive service must use HTTPS or the same origin");
    }
    endpoint.pathname = endpoint.pathname.replace(/\/?$/, "/");
    endpoint.search = ""; endpoint.hash = "";
    return new URL((year ? `years/${year}/worldfactbook/` : "indexes/worldfactbook/") + value, endpoint).href;
  }
  async function resourceJSON(path, options) {
    const value = safePath(path), local = new URL(value, root).href;
    const remote = await resourceURL(value);
    try { return await fetchJSON(remote, options); }
    catch (error) { if (remote === local) throw error; return fetchJSON(local, options); }
  }


  const CONFIG = Object.freeze({
    name: "ZZX-WorldFactbook",
    historicalStart: 1962,
    historicalEnd: 2027,
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
    if (!opts.refresh && cache.has(absolute) && Date.now()-(cachedAt.get(absolute)||0)<60000) return cache.get(absolute);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(opts.timeout || 18000));

    try {
      const response = await fetch(absolute, {
        cache: opts.refresh ? "no-store" : "default",
        credentials: new URL(absolute).origin === new URL(root).origin ? "same-origin" : "omit",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        const error = new Error("HTTP " + response.status + " for " + absolute);
        error.status = response.status;
        throw error;
      }

      const payload = await response.json();
      cache.set(absolute, payload);cachedAt.set(absolute,Date.now());
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function optionalJSON(path, options) {
    try {
      return await resourceJSON("api/" + clean(path), options);
    } catch (error) {
      if (error && error.status === 404) return null;
      throw error;
    }
  }

  const api = {
    portalIndex: (options) => resourceJSON("api/portal-index.json", options),
    sourceIndex: (options) => resourceJSON("api/source-index.json", options),
    referenceIndex: (options) => resourceJSON("api/reference-index.json", options),
    electricity: (options) => resourceJSON("api/electricity-history.json", options),
    mediaIndex: (options) => resourceJSON("api/media-index.json", options),
    leaders: (options) => resourceJSON("api/" + CONFIG.featureEndpoints.leaders, options),
    facts: (options) => resourceJSON("api/" + CONFIG.featureEndpoints.facts, options),
    images: (options) => resourceJSON("api/" + CONFIG.featureEndpoints.images, options),
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
    resourceJSON,
    resourceURL,
    resourceYear,
    archiveAssetURL: resourceURL,
    optionalJSON,
    api,
    portalIndex: api.portalIndex,
    sourceIndex: api.sourceIndex,
    referenceIndex: api.referenceIndex,
    electricity: api.electricity,
    mediaIndex: api.mediaIndex,
    clearCache: () => {cache.clear();cachedAt.clear();}
  });
})();
