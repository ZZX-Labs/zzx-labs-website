/* worldfactbook/worldfactbook.js
 * Static data client for the ZZX World Factbook archive contracts.
 */
(function () {
  "use strict";

  const W = window;
  if (W.ZZXWorldFactbook && W.ZZXWorldFactbook.__version >= 1) return;

  const script = document.currentScript;
  const scriptURL = new URL(script && script.src ? script.src : "./worldfactbook.js", document.baseURI);
  const ROOT = new URL("./", scriptURL);
  const API = new URL("./api/", ROOT);

  const cache = new Map();

  function cleanPath(path) {
    return String(path || "")
      .replace(/\\/g, "/")
      .replace(/^\.?\//, "");
  }

  function apiURL(path) {
    return new URL(cleanPath(path), API).href;
  }

  function rootURL(path) {
    const p = cleanPath(path);
    if (p.toLowerCase().startsWith("worldfactbook/")) {
      return new URL(p.slice("worldfactbook/".length), ROOT).href;
    }
    return new URL(p, ROOT).href;
  }

  async function fetchJSON(url, options) {
    const opts = options || {};
    const key = String(url);
    if (!opts.refresh && cache.has(key)) return cache.get(key);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(opts.timeout || 18000));

    try {
      const response = await fetch(url, {
        cache: opts.refresh ? "no-store" : "default",
        credentials: "same-origin",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        const error = new Error("HTTP " + response.status + " for " + url);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();
      cache.set(key, data);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function categoryPath(year, category) {
    return "editions/" + encodeURIComponent(String(year)) + "/" +
      encodeURIComponent(String(category)) + ".json";
  }

  async function portalIndex(options) {
    return fetchJSON(apiURL("portal-index.json"), options);
  }

  async function sourceIndex(options) {
    return fetchJSON(apiURL("source-index.json"), options);
  }

  async function edition(year, options) {
    return fetchJSON(apiURL("editions/" + encodeURIComponent(String(year)) + "/index.json"), options);
  }

  async function category(year, categoryId, options) {
    return fetchJSON(apiURL(categoryPath(year, categoryId)), options);
  }

  async function media(year, options) {
    return fetchJSON(apiURL("media/" + encodeURIComponent(String(year)) + "/index.json"), options);
  }

  async function attributions(year, options) {
    return fetchJSON(apiURL("attributions/" + encodeURIComponent(String(year)) + "/images.json"), options);
  }

  async function electricity(options) {
    return fetchJSON(apiURL("electricity-history.json"), options);
  }

  async function loadCategories(year, categories, options) {
    const ids = Array.from(new Set((categories || []).filter(Boolean)));
    const out = [];
    const queue = ids.slice();
    const workers = Math.min(4, Math.max(1, queue.length));

    async function worker() {
      while (queue.length) {
        const id = queue.shift();
        if (!id) continue;
        try {
          const payload = await category(year, id, options);
          const rows = Array.isArray(payload && payload.chunks) ? payload.chunks : [];
          out.push.apply(out, rows);
        } catch (error) {
          if (!error || error.status !== 404) throw error;
        }
      }
    }

    await Promise.all(Array.from({ length: workers }, worker));
    return out;
  }

  function normalizedEntity(row) {
    const code = String(row && row.entity_code || "").trim();
    const name = String(row && row.entity_name || "").trim();
    return {
      code,
      name,
      key: code || name || "",
      label: name || code || "Global / uncategorized"
    };
  }

  function entities(rows) {
    const byKey = new Map();
    (rows || []).forEach((row) => {
      const entity = normalizedEntity(row);
      if (!entity.key) return;
      if (!byKey.has(entity.key)) byKey.set(entity.key, entity);
    });
    return Array.from(byKey.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }

  function matchesEntity(row, entityKey) {
    if (!entityKey) return true;
    const entity = normalizedEntity(row);
    return entity.code === entityKey || entity.name === entityKey || entity.key === entityKey;
  }

  function searchableText(row) {
    return [
      row && row.entity_code,
      row && row.entity_name,
      row && row.category,
      row && row.content,
      row && row.caption,
      row && row.credit,
      row && row.ocr_text,
      row && row.visual_type,
      row && row.source_provider,
      row && row.source_identifier
    ].filter(Boolean).join("\n").toLowerCase();
  }

  function filterRows(rows, options) {
    const opts = options || {};
    const query = String(opts.query || "").trim().toLowerCase();
    return (rows || []).filter((row) => {
      if (!matchesEntity(row, opts.entity || "")) return false;
      if (opts.category && row.category !== opts.category) return false;
      if (opts.visualType && row.visual_type !== opts.visualType) return false;
      if (query && !searchableText(row).includes(query)) return false;
      return true;
    });
  }

  function clearCache() {
    cache.clear();
  }

  W.ZZXWorldFactbook = Object.freeze({
    __version: 1,
    root: ROOT.href,
    apiRoot: API.href,
    apiURL,
    assetURL: rootURL,
    fetchJSON,
    portalIndex,
    sourceIndex,
    edition,
    category,
    loadCategories,
    media,
    attributions,
    electricity,
    normalizedEntity,
    entities,
    filterRows,
    clearCache
  });
})();
