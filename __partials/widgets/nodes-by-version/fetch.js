// __partials/widgets/nodes-by-version/fetch.js
// DROP-IN (FIXED for Bitnodes snapshot/<ts>/ payloads)
//
// Key fixes:
// - Uses AbortController timeout (prevents hanging fetch).
// - Detects HTML/Cloudflare responses and returns clear errors.
// - DOES NOT cache huge payloads (snapshot/<ts>/ can be massive and will blow localStorage quota).
// - Keeps last-good cache for small endpoints + 429 handling.
// - Direct first, AllOrigins fallback.

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXNodesByVersionFetch = W.ZZXNodesByVersionFetch || {});

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  const CACHE_PREFIX = "zzx:nodes-by-version:";
  const CACHE_TTL_MS = 30 * 60_000; // 30 min last-good cache

  // Hard limits to avoid localStorage quota explosions
  const MAX_CACHE_TEXT_BYTES = 140_000; // ~140KB
  const MAX_ERROR_SNIP = 220;

  // Request timeout (snapshot/<ts>/ can be large; give it more room than 12s)
  const TIMEOUT_MS = 25_000;

  function now() { return Date.now(); }

  function snip(s, n = MAX_ERROR_SNIP) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

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
      // ignore quota/private mode
    }
  }

  function looksLikeHTML(text) {
    const s = String(text || "").trim().toLowerCase();
    if (!s) return false;
    if (s.startsWith("<!doctype") || s.startsWith("<html")) return true;
    if (s.includes("<head") || s.includes("<body")) return true;
    // common CF-ish markers
    if (s.includes("cf-ray") || s.includes("cloudflare") || s.includes("attention required")) return true;
    return false;
  }

  function shouldCache(url, text, json) {
    // Never cache snapshot/<timestamp>/ (huge nodes map)
    const u = String(url || "");
    if (u.includes("/api/v1/snapshots/") && !u.endsWith("/latest/")) return false;

    // Also guard by raw size
    const bytes = (typeof text === "string") ? text.length : 0;
    if (bytes > MAX_CACHE_TEXT_BYTES) return false;

    // If payload includes a giant nodes object, don't cache it
    if (json && typeof json === "object" && json.nodes && typeof json.nodes === "object") return false;

    return true;
  }

  async function fetchText(url, opts) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(new Error("timeout")), TIMEOUT_MS);

    try {
      const r = await fetch(url, {
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        signal: ctl.signal,
        headers: {
          "accept": "application/json,text/plain;q=0.9,*/*;q=0.8",
          ...(opts && opts.headers ? opts.headers : {})
        }
      });

      const text = await r.text();

      if (!r.ok) {
        const err = new Error(`HTTP ${r.status} for ${url}: ${snip(text) || "no body"}`);
        err.status = r.status;
        err.body = text;
        throw err;
      }

      return text;
    } finally {
      clearTimeout(t);
    }
  }

  function parseJSON(text, url) {
    const s = String(text ?? "").trim();
    if (!s) throw new Error(`empty response: ${url}`);
    if (looksLikeHTML(s)) throw new Error(`non-JSON (HTML) for ${url}: "${snip(s)}"`);

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
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  async function fetchDirect(url) {
    const text = await fetchText(url);
    const json = parseJSON(text, url);
    return { text, json };
  }

  async function fetchAllOrigins(url) {
    const prox = AO_RAW + encodeURIComponent(String(url));
    const text = await fetchText(prox);
    const json = parseJSON(text, url);
    return { text, json };
  }

  NS.fetchJSON = async function fetchJSON(url) {
    await maybeBackoff();

    // 1) direct
    try {
      const { text, json } = await fetchDirect(url);

      if (shouldCache(url, text, json)) cacheWrite(url, json);

      // reset backoff on success
      backoffMs = 0;

      return { ok: true, json, from: "direct" };
    } catch (e1) {
      // Rate limit: use cache immediately
      if (e1 && (e1.status === 429)) {
        last429At = now();
        backoffMs = Math.min(180_000, backoffMs ? backoffMs * 2 : 20_000);

        const cached = cacheRead(url);
        if (cached != null) return { ok: true, json: cached, from: "cache(429)" };
        // fall through to AO
      }

      // 2) AllOrigins fallback
      try {
        const { text, json } = await fetchAllOrigins(url);

        if (shouldCache(url, text, json)) cacheWrite(url, json);

        backoffMs = 0;
        return { ok: true, json, from: "allorigins" };
      } catch (e2) {
        // 3) last-good cache on any failure
        const cached = cacheRead(url);
        if (cached != null) return { ok: true, json: cached, from: "cache(fallback)" };

        throw new Error(
          `fetchJSON failed\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  };
})();
