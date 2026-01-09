// __partials/widgets/mempool-specs/fetch.js
// DROP-IN COMPLETE REPLACEMENT
//
// Robust fetch layer used by mempool-specs (and its TxFetcher ctx):
// - direct fetch first
// - fallback to AllOrigins RAW
// - text-first parsing for readable errors (HTML/edge pages, rate-limits, etc.)
// - cached last-good response in localStorage (keeps widget alive on 429/temporary outages)
//
// Exposes:
//   window.ZZXMempoolSpecsFetch.fetchText(url, {signal})
//   window.ZZXMempoolSpecsFetch.fetchJSON(url, {signal})
//
(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXMempoolSpecsFetch = W.ZZXMempoolSpecsFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  const CACHE_PREFIX = "zzx:mempool-specs:";
  const CACHE_TTL_MS = 10 * 60_000;          // 10 min "fresh"
  const CACHE_STALE_MAX_MS = 7 * 24 * 60_000; // 7 days "survival"

  function now() { return Date.now(); }

  function isAbort(err) {
    return !!err && (err.name === "AbortError" || err.code === 20);
  }

  function snip(s, n = 180) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function cacheKey(url, kind) {
    return `${CACHE_PREFIX}${kind}:` + encodeURIComponent(String(url || ""));
  }

  // Returns { v, ageMs, stale: boolean } or null
  function cacheRead(url, kind, { allowStale = false } = {}) {
    try {
      const raw = localStorage.getItem(cacheKey(url, kind));
      if (!raw) return null;

      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;

      const t = Number(obj.t || 0);
      if (!t) return null;

      const age = now() - t;

      // Fresh path
      if (age <= CACHE_TTL_MS) {
        return { v: obj.v ?? null, ageMs: age, stale: false };
      }

      // Stale survival path
      if (allowStale && age <= CACHE_STALE_MAX_MS) {
        return { v: obj.v ?? null, ageMs: age, stale: true };
      }

      return null;
    } catch {
      return null;
    }
  }

  function cacheWrite(url, kind, value) {
    try {
      localStorage.setItem(cacheKey(url, kind), JSON.stringify({ t: now(), v: value }));
    } catch {
      // ignore quota/private mode
    }
  }

  async function fetchTextRaw(url, init) {
    const r = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      ...(init || {})
    });

    const t = await r.text();

    if (!r.ok) {
      const err = new Error(`HTTP ${r.status}: ${snip(t) || "no body"}`);
      err.status = r.status;
      err.body = t;
      throw err;
    }
    return t;
  }

  async function fetchTextDirect(url, { signal } = {}) {
    return await fetchTextRaw(url, { signal });
  }

  async function fetchTextAO(url, { signal } = {}) {
    const u = AO_RAW + encodeURIComponent(String(url));
    return await fetchTextRaw(u, { signal });
  }

  function parseJSON(text, url, tag) {
    const s = String(text ?? "").trim();
    if (!s) throw new Error(`empty response (${tag}) for ${url}`);

    // allow numeric-only
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);

    try {
      return JSON.parse(s);
    } catch {
      const hint =
        s.startsWith("<") ? "Looks like HTML (edge page / blocked)." :
        (s.toLowerCase().includes("too many") || s.toLowerCase().includes("rate")) ? "Looks like rate-limit text." :
        "Non-JSON response.";
      throw new Error(`JSON.parse failed (${hint}, ${tag}) for ${url}: "${snip(s)}"`);
    }
  }

  // Public: fetchText with direct -> AO -> cache
  NS.fetchText = async function fetchText(url, { signal } = {}) {
    // 1) direct
    try {
      const t = await fetchTextDirect(url, { signal });
      cacheWrite(url, "text", t);
      return { ok: true, text: t, from: "direct" };
    } catch (e1) {
      if (isAbort(e1)) throw e1;

      // rate-limited / transient? use fresh cache immediately if available
      if (e1 && (e1.status === 429 || e1.status === 503)) {
        const c = cacheRead(url, "text", { allowStale: true });
        if (c && c.v != null) {
          return { ok: true, text: c.v, from: c.stale ? "cache(stale,rate-limit)" : "cache(rate-limit)" };
        }
      }

      // 2) AllOrigins
      try {
        const t = await fetchTextAO(url, { signal });
        cacheWrite(url, "text", t);
        return { ok: true, text: t, from: "allorigins" };
      } catch (e2) {
        if (isAbort(e2)) throw e2;

        // 3) last-good cache (fresh OR stale survival)
        const c = cacheRead(url, "text", { allowStale: true });
        if (c && c.v != null) {
          return { ok: true, text: c.v, from: c.stale ? "cache(stale,fallback)" : "cache(fallback)" };
        }

        throw new Error(
          `fetchText failed\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  };

  // Public: fetchJSON built on text-first (better error reporting)
  NS.fetchJSON = async function fetchJSON(url, { signal } = {}) {
    // 1) direct
    try {
      const t = await fetchTextDirect(url, { signal });
      const j = parseJSON(t, url, "direct");
      cacheWrite(url, "json", j);
      return { ok: true, json: j, from: "direct" };
    } catch (e1) {
      if (isAbort(e1)) throw e1;

      if (e1 && (e1.status === 429 || e1.status === 503)) {
        const c = cacheRead(url, "json", { allowStale: true });
        if (c && c.v != null) {
          return { ok: true, json: c.v, from: c.stale ? "cache(stale,rate-limit)" : "cache(rate-limit)" };
        }
      }

      // 2) AO
      try {
        const t = await fetchTextAO(url, { signal });
        const j = parseJSON(t, url, "allorigins");
        cacheWrite(url, "json", j);
        return { ok: true, json: j, from: "allorigins" };
      } catch (e2) {
        if (isAbort(e2)) throw e2;

        // 3) cache fallback (fresh OR stale survival)
        const c = cacheRead(url, "json", { allowStale: true });
        if (c && c.v != null) {
          return { ok: true, json: c.v, from: c.stale ? "cache(stale,fallback)" : "cache(fallback)" };
        }

        throw new Error(
          `fetchJSON failed\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  };
})();
