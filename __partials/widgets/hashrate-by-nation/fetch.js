// __partials/widgets/hashrate-by-nation/fetch.js
// DROP-IN (DEBUGGED, MORE TOLERANT)
//
// Fixes the common causes of:
//   JSON.parse: unexpected character at line 1 column 1
//
// What this does:
// - Tries DIRECT fetch first
// - Falls back to AllOrigins RAW
// - Reads TEXT first (never r.json())
// - Strips BOM + common anti-XSSI prefixes
// - Detects HTML / error pages early and surfaces a useful preview
// - If server returns JSON but with wrong headers, it still parses

(function () {
  "use strict";

  const NS = (window.ZZXHashrateNationFetch =
    window.ZZXHashrateNationFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  function preview(s, n = 220) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
  }

  function stripBOM(s) {
    // UTF-8 BOM
    return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
  }

  function stripAntiXSSI(s) {
    // Common prefixes:
    // )]}'
    // while(1);
    // for(;;);
    // /*...*/ (rare)
    let out = String(s || "");
    out = out.replace(/^\uFEFF/, "");                 // BOM
    out = out.replace(/^\)\]\}'\s*\n?/, "");          // )]}'
    out = out.replace(/^\s*while\s*\(\s*1\s*\)\s*;\s*/, "");
    out = out.replace(/^\s*for\s*\(\s*;\s*;\s*\)\s*;\s*/, "");
    return out;
  }

  function looksLikeHTML(s) {
    const t = String(s || "").trim().toLowerCase();
    return (
      t.startsWith("<!doctype html") ||
      t.startsWith("<html") ||
      t.startsWith("<head") ||
      t.startsWith("<body") ||
      t.startsWith("<!doctype")
    );
  }

  async function fetchText(url, viaAO) {
    const target = viaAO ? (AO_RAW + encodeURIComponent(String(url))) : String(url);

    const r = await fetch(target, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      headers: {
        // Helps some CDNs behave more consistently
        "Accept": "application/json,text/plain,*/*",
      },
    });

    const t = await r.text();

    if (!r.ok) {
      // Even on error, show something actionable
      throw new Error(`${viaAO ? "AO" : "direct"} HTTP ${r.status}: ${preview(t) || "no body"}`);
    }

    return t;
  }

  function parseJSON(text, source) {
    let s = stripBOM(String(text || ""));
    s = s.trim();

    if (!s) throw new Error(`empty response (${source})`);

    // If we got an HTML page (CORS proxy error, 403 page, Cloudflare, etc.)
    if (looksLikeHTML(s)) {
      throw new Error(`non-JSON HTML response (${source}): ${preview(s)}`);
    }

    // If it starts with a tag, also treat as HTML-ish
    if (s[0] === "<") {
      throw new Error(`non-JSON response (${source}): ${preview(s)}`);
    }

    // Strip anti-XSSI wrappers then re-trim
    s = stripAntiXSSI(s).trim();

    // Quick sanity: JSON must begin with { or [
    const c0 = s[0];
    if (c0 !== "{" && c0 !== "[") {
      throw new Error(`unexpected leading char '${c0}' (${source}): ${preview(s)}`);
    }

    try {
      return JSON.parse(s);
    } catch (e) {
      throw new Error(`JSON.parse failed (${source}): ${preview(s)}`);
    }
  }

  // Public API: fetchJSON(url) -> parsed object
  NS.fetchJSON = async function fetchJSON(url) {
    // 1) direct
    try {
      const t1 = await fetchText(url, false);
      return parseJSON(t1, "direct");
    } catch (e1) {
      // 2) allorigins fallback
      try {
        const t2 = await fetchText(url, true);
        return parseJSON(t2, "allorigins");
      } catch (e2) {
        // Surface both causes, but keep it readable
        throw new Error(
          "fetchJSON failed\n" +
          `direct: ${String(e1 && e1.message ? e1.message : e1)}\n` +
          `allorigins: ${String(e2 && e2.message ? e2.message : e2)}`
        );
      }
    }
  };
})();
