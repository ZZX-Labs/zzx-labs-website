// __partials/widgets/nodes/fetch.js
// DROP-IN (DEBUGGED)
// Robust JSON fetch:
//   1) try direct (fast)
//   2) fallback to AllOrigins RAW
// Text-first parsing with preview to avoid silent JSON.parse explosions.

(function () {
  "use strict";

  const NS = (window.ZZXNodesFetch = window.ZZXNodesFetch || {});

  function compactPreview(s, max = 200) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > max ? (t.slice(0, max) + "…") : t;
  }

  async function fetchText(url) {
    const r = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      credentials: "omit",
    });
    const t = await r.text();
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}: ${compactPreview(t) || "no body"}`);
    }
    return t;
  }

  function parseJSON(text, sourceLabel) {
    const s = String(text ?? "").trim();
    if (!s) throw new Error(`empty response (${sourceLabel})`);
    try {
      return JSON.parse(s);
    } catch {
      throw new Error(`JSON.parse failed (${sourceLabel}): ${compactPreview(s) || "no preview"}`);
    }
  }

  // core-aware wrapper: supports ZZXWidgetsCore.fetchText/fetchJSON if you have it
  NS.fetchJSON = async function fetchJSON(core, url) {
    const directUrl = String(url);

    // 1) direct fetch
    try {
      if (core && typeof core.fetchText === "function") {
        const text = await core.fetchText(directUrl);
        return parseJSON(text, "direct(core)");
      }
      const text = await fetchText(directUrl);
      return parseJSON(text, "direct");
    } catch (e1) {
      // 2) allorigins fallback
      const aoUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(directUrl);
      try {
        if (core && typeof core.fetchText === "function") {
          const text = await core.fetchText(aoUrl);
          return parseJSON(text, "allorigins(core)");
        }
        const text = await fetchText(aoUrl);
        return parseJSON(text, "allorigins");
      } catch (e2) {
        throw new Error(
          `fetchJSON failed\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  };
})();
