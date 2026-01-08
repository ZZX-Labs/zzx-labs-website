// __partials/widgets/nodes-by-version/fetch.js
// DROP-IN (DEBUGGED)
// Robust fetch with:
// - direct fetch attempt
// - fallback to AllOrigins RAW
// - 429 handling: uses cached last-good response
// - small backoff on repeated rate-limit
// - text-first parse for better errors

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXNodesByVersionFetch =
    W.ZZXNodesByVersionFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  const CACHE_PREFIX = "zzx:nodes-by-version:";
  const CACHE_TTL_MS = 30 * 60_000; // 30 min last-good cache

  function snip(s, n = 180) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function now() { return Date.now(); }

  function cacheKey(url) {
    return CACHE_PREFIX + encodeURIComponent(String(url || ""));
  }

  function cacheRead(url) {
    try {
      const raw = localStorage.getItem(cacheKey(url));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.t || (now() - obj.t) > CACHE_TTL_MS) return null;
      return obj.v ?? null;
    } catch {
      return null;
    }
  }

  function cacheWrite(url, value) {
    try {
      localStorage.setItem(cacheKey(url), JSON.stringify({ t: now(), v: value }));
    } catch {
      // ignore quota / private mode
    }
  }

  async function fetchTextDirect(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "omit" });
    const t = await r.text();
    if (!r.ok) {
      const head = snip(t);
      const err = new Error(`HTTP ${r.status} for ${url}: ${head || "no body"}`);
      err.status = r.status;
      err.body = t;
      throw err;
    }
    return t;
  }

  async function fetchTextAO(url) {
    const r = await fetch(AO_RAW + encodeURIComponent(String(url)), { cache: "no-store" });
    const t = await r.text();
    if (!r.ok) {
      const head = snip(t);
      const err = new Error(`AO HTTP ${r.status}: ${head || "no body"}`);
      err.status = r.status;
      err.body = t;
      throw err;
    }
    return t;
  }

  function parseJSON(text, url) {
    const s = String(text ?? "").trim();
    if (!s) throw new Error(`empty response: ${url}`);
    try {
      return JSON.parse(s);
    } catch {
      throw new Error(`JSON.parse failed for ${url}: "${snip(s)}"`);
    }
  }

  // soft backoff state (per page load)
  let last429At = 0;
  let backoffMs = 0;

  async function maybeBackoff() {
    const t = now();
    if (backoffMs > 0 && (t - last429At) < backoffMs) {
      const wait = backoffMs - (t - last429At);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  NS.fetchJSON = async function fetchJSON(url) {
    await maybeBackoff();

    // 1) direct
    try {
      const text = await fetchTextDirect(url);
      const json = parseJSON(text, url);
      cacheWrite(url, json);
      // reset backoff on success
      backoffMs = 0;
      return { ok: true, json, from: "direct" };
    } catch (e1) {
      // If rate limited, use cache immediately
      if (e1 && (e1.status === 429)) {
        last429At = now();
        backoffMs = Math.min(120_000, backoffMs ? backoffMs * 2 : 15_000);

        const cached = cacheRead(url);
        if (cached != null) return { ok: true, json: cached, from: "cache(429)" };

        // fallback to AO anyway (sometimes AO has different limits)
      }

      // 2) AllOrigins
      try {
        const text = await fetchTextAO(url);
        const json = parseJSON(text, url);
        cacheWrite(url, json);
        backoffMs = 0;
        return { ok: true, json, from: "allorigins" };
      } catch (e2) {
        // 3) last-good cache on any failure
        const cached = cacheRead(url);
        if (cached != null) {
          return { ok: true, json: cached, from: "cache(fallback)" };
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
