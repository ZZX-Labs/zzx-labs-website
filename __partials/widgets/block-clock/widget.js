// __partials/widgets/block-clock/widget.js
// Public GitHub Pages safe. No backend required.
//
// Source: mempool.space (direct first; AllOrigins fallback if needed)
//
// Endpoints used (text/json):
// - https://mempool.space/api/blocks/tip/height   (text)
// - https://mempool.space/api/blocks/tip/hash     (text)
// - https://mempool.space/api/block/<hash>        (json; includes timestamp + prev block hash)
//
// What it shows:
// - Live block height
// - A big running timer since last block (HH:MM:SS.mmm)
// - Last block interval (prev->tip) and the interval before that (prevprev->prev) as a ±% change
// - Start/end times: UTC + user-local
//
// Notes:
// - “Since last block” is the universal clock face.
// - Interval change uses the last two completed intervals.

(function () {
  "use strict";

  const W = window;
  const ID = "block-clock";

  const CFG = {
    REFRESH_MS: 15_000,          // poll tip
    TICK_MS: 50,                 // update running clock
    TIMEOUT_MS: 20_000,
    RETRIES: 1,
    RETRY_DELAY_MS: 650,

    MEMPOOL_BASE: "https://mempool.space/api",
    AO_RAW: "https://api.allorigins.win/raw?url=",

    CACHE_TTL_MS: 5 * 60_000,
    CACHE_PREFIX: "zzx:block-clock:",

    MIN_RENDER_INTERVAL_MS: 250,
  };

  let inflight = false;

  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, text) { const el = q(root, sel); if (el) el.textContent = String(text ?? "—"); }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function withTimeout(p, ms, label) {
    let t = null;
    const to = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([p, to]).finally(() => clearTimeout(t));
  }

  function snip(s, n = 180) {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function looksLikeHTML(text) {
    const s = String(text || "").trim().toLowerCase();
    return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head") || s.includes("<body");
  }

  function cacheKey(url) { return CFG.CACHE_PREFIX + encodeURIComponent(String(url || "")); }

  function cacheRead(url) {
    try {
      const raw = localStorage.getItem(cacheKey(url));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.t || (Date.now() - obj.t) > CFG.CACHE_TTL_MS) return null;
      return obj.v ?? null;
    } catch { return null; }
  }

  function cacheWrite(url, value) {
    try { localStorage.setItem(cacheKey(url), JSON.stringify({ t: Date.now(), v: value })); }
    catch { }
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
    const t = await r.text();
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status} for ${url}: ${snip(t) || "no body"}`);
      err.status = r.status;
      err.body = t;
      throw err;
    }
    return t;
  }

  async function fetchJSON(url) {
    const t = await fetchText(url);
    if (looksLikeHTML(t)) throw new Error(`Non-JSON (HTML) from ${url}: ${snip(t)}`);
    try { return JSON.parse(String(t).trim()); }
    catch { throw new Error(`JSON.parse failed for ${url}: ${snip(t)}`); }
  }

  async function fetchTextDirectThenAO(url, label) {
    try {
      const txt = await withTimeout(fetchText(url), CFG.TIMEOUT_MS, label ? `${label} (direct)` : "direct");
      cacheWrite(url, txt);
      return { text: txt, from: "direct" };
    } catch (e1) {
      const ao = CFG.AO_RAW + encodeURIComponent(String(url));
      try {
        const txt = await withTimeout(fetchText(ao), CFG.TIMEOUT_MS, label ? `${label} (allorigins)` : "allorigins");
        cacheWrite(url, txt);
        return { text: txt, from: "allorigins" };
      } catch (e2) {
        const cached = cacheRead(url);
        if (cached != null) return { text: cached, from: "cache" };
        throw new Error(
          `fetch failed for ${url}\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  }

  async function fetchJSONDirectThenAO(url, label) {
    try {
      const j = await withTimeout(fetchJSON(url), CFG.TIMEOUT_MS, label ? `${label} (direct)` : "direct");
      cacheWrite(url, j);
      return { json: j, from: "direct" };
    } catch (e1) {
      const ao = CFG.AO_RAW + encodeURIComponent(String(url));
      try {
        const j = await withTimeout(fetchJSON(ao), CFG.TIMEOUT_MS, label ? `${label} (allorigins)` : "allorigins");
        cacheWrite(url, j);
        return { json: j, from: "allorigins" };
      } catch (e2) {
        const cached = cacheRead(url);
        if (cached != null) return { json: cached, from: "cache" };
        throw new Error(
          `fetch failed for ${url}\n` +
          `direct: ${String(e1?.message || e1)}\n` +
          `allorigins: ${String(e2?.message || e2)}`
        );
      }
    }
  }

  function toNum(x) { const v = Number(x); return Number.isFinite(v) ? v : NaN; }

  function fmtHeight(h) { return Number.isFinite(h) ? Math.trunc(h).toLocaleString() : "—"; }

  function pad2(n) { return String(Math.trunc(n)).padStart(2, "0"); }
  function pad3(n) { return String(Math.trunc(n)).padStart(3, "0"); }

  function fmtDurationMs(ms) {
    const x = Math.max(0, Math.trunc(toNum(ms) || 0));
    const hh = Math.floor(x / 3600000);
    const rem1 = x - hh * 3600000;
    const mm = Math.floor(rem1 / 60000);
    const rem2 = rem1 - mm * 60000;
    const ss = Math.floor(rem2 / 1000);
    const mmm = rem2 - ss * 1000;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}.${pad3(mmm)}`;
  }

  function fmtIntervalSec(sec) {
    if (!Number.isFinite(sec)) return "—";
    const s = Math.max(0, Math.trunc(sec));
    const mm = Math.floor(s / 60);
    const ss = s - mm * 60;
    return `${mm}m ${ss}s`;
  }

  function fmtPct(x) {
    if (!Number.isFinite(x)) return "—";
    const sign = x > 0 ? "+" : "";
    return sign + x.toFixed(2) + "%";
  }

  function fmtUTC(dt) {
    if (!(dt instanceof Date) || isNaN(dt.getTime())) return "—";
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    const hh = String(dt.getUTCHours()).padStart(2, "0");
    const mm = String(dt.getUTCMinutes()).padStart(2, "0");
    const ss = String(dt.getUTCSeconds()).padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}:${ss} UTC`;
  }

  function fmtLocal(dt) {
    if (!(dt instanceof Date) || isNaN(dt.getTime())) return "—";
    try {
      return dt.toLocaleString(undefined, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
    } catch {
      return dt.toString();
    }
  }

  async function fetchTip() {
    const base = CFG.MEMPOOL_BASE;
    const hUrl = base + "/blocks/tip/height";
    const hashUrl = base + "/blocks/tip/hash";

    const [hRes, hashRes] = await Promise.all([
      fetchTextDirectThenAO(hUrl, "mempool tip height"),
      fetchTextDirectThenAO(hashUrl, "mempool tip hash"),
    ]);

    const height = Math.trunc(toNum(String(hRes.text || "").trim()));
    const hash = String(hashRes.text || "").trim();

    if (!Number.isFinite(height) || !hash) throw new Error("tip unavailable");
    return { height, hash, from: `${hRes.from}/${hashRes.from}` };
  }

  async function fetchBlock(hash) {
    const url = CFG.MEMPOOL_BASE + "/block/" + encodeURIComponent(String(hash));
    const res = await fetchJSONDirectThenAO(url, "mempool block");
    const j = res.json || {};

    // mempool.space uses `timestamp` (seconds) and `previousblockhash`
    const ts = Math.trunc(toNum(j.timestamp));
    const prev = String(j.previousblockhash || "").trim();

    return { ts, prev, from: res.from };
  }

  async function fetch3Timestamps(tipHash) {
    const b2 = await fetchBlock(tipHash);
    if (!b2.prev) throw new Error("missing previousblockhash");

    const b1 = await fetchBlock(b2.prev);
    if (!b1.prev) throw new Error("missing prevprev hash");

    const b0 = await fetchBlock(b1.prev);

    if (!Number.isFinite(b2.ts) || !Number.isFinite(b1.ts) || !Number.isFinite(b0.ts)) {
      throw new Error("missing timestamps");
    }

    return {
      tipTs: b2.ts,
      prevTs: b1.ts,
      prevPrevTs: b0.ts,
      from: `block:${b2.from}/${b1.from}/${b0.from}`,
    };
  }

  function renderDelta(root, pct) {
    const el = q(root, "[data-bc-delta]");
    if (!el) return;

    el.classList.remove("zzx-bc__delta-pos", "zzx-bc__delta-neg", "zzx-bc__delta-flat");

    if (!Number.isFinite(pct)) {
      el.textContent = "—";
      el.classList.add("zzx-bc__delta-flat");
      return;
    }

    el.textContent = fmtPct(pct);

    if (pct > 0.0001) el.classList.add("zzx-bc__delta-pos");
    else if (pct < -0.0001) el.classList.add("zzx-bc__delta-neg");
    else el.classList.add("zzx-bc__delta-flat");
  }

  function render(root, state) {
    const now = Date.now();

    setText(root, "[data-bc-height]", fmtHeight(state.height));

    // big running clock since tip block (time since last block mined)
    if (Number.isFinite(state.tipTs)) {
      const sinceMs = now - (state.tipTs * 1000);
      setText(root, "[data-bc-since]", fmtDurationMs(sinceMs));
    } else {
      setText(root, "[data-bc-since]", "—");
    }

    setText(root, "[data-bc-interval]", fmtIntervalSec(state.lastIntervalSec));
    renderDelta(root, state.deltaPct);

    const start = Number.isFinite(state.prevTs) ? new Date(state.prevTs * 1000) : null;
    const end = Number.isFinite(state.tipTs) ? new Date(state.tipTs * 1000) : null;

    setText(root, "[data-bc-start]", start ? fmtLocal(start) : "—");
    setText(root, "[data-bc-end]", end ? fmtLocal(end) : "—");

    const utcRange = (start && end) ? (fmtUTC(start) + " → " + fmtUTC(end)) : "—";
    setText(root, "[data-bc-utc]", utcRange);

    setText(root, "[data-bc-sub]", state.sub || "—");
  }

  async function update(root, state) {
    if (!root || inflight) return;
    inflight = true;

    try {
      setText(root, "[data-bc-status]", "loading");

      let lastErr = null;
      for (let attempt = 0; attempt <= CFG.RETRIES; attempt++) {
        try {
          const tip = await fetchTip();
          const trio = await fetch3Timestamps(tip.hash);

          const lastIntervalSec = (trio.tipTs - trio.prevTs);
          const priorIntervalSec = (trio.prevTs - trio.prevPrevTs);

          let deltaPct = NaN;
          if (Number.isFinite(lastIntervalSec) && Number.isFinite(priorIntervalSec) && priorIntervalSec > 0) {
            deltaPct = ((lastIntervalSec - priorIntervalSec) / priorIntervalSec) * 100;
          }

          state.height = tip.height;
          state.tipTs = trio.tipTs;
          state.prevTs = trio.prevTs;
          state.prevPrevTs = trio.prevPrevTs;
          state.lastIntervalSec = Number.isFinite(lastIntervalSec) ? lastIntervalSec : NaN;
          state.priorIntervalSec = Number.isFinite(priorIntervalSec) ? priorIntervalSec : NaN;
          state.deltaPct = deltaPct;

          state.sub = `mempool.space (via ${tip.from}, ${trio.from})`;

          render(root, state);
          setText(root, "[data-bc-status]", "ok");
          inflight = false;
          return;
        } catch (e) {
          lastErr = e;
          if (attempt < CFG.RETRIES) await sleep(CFG.RETRY_DELAY_MS);
        }
      }

      throw lastErr || new Error("update failed");
    } catch (e) {
      setText(root, "[data-bc-status]", "error");
      setText(root, "[data-bc-sub]", "error: " + String(e?.message || e));
    } finally {
      inflight = false;
    }
  }

  function wire(root, state) {
    const refresh = q(root, "[data-bc-refresh]");
    if (refresh && refresh.dataset.zzxBound !== "1") {
      refresh.dataset.zzxBound = "1";
      refresh.addEventListener("click", () => update(root, state));
    }
  }

  function boot(root) {
    if (!root) return;

    const state = (root.__zzxBCState = root.__zzxBCState || {
      height: NaN,
      tipTs: NaN,
      prevTs: NaN,
      prevPrevTs: NaN,
      lastIntervalSec: NaN,
      priorIntervalSec: NaN,
      deltaPct: NaN,
      sub: "—",
    });

    wire(root, state);

    if (root.__zzxBCTimer) { clearInterval(root.__zzxBCTimer); root.__zzxBCTimer = null; }
    if (root.__zzxBCTick) { clearInterval(root.__zzxBCTick); root.__zzxBCTick = null; }

    update(root, state);
    root.__zzxBCTimer = setInterval(() => update(root, state), CFG.REFRESH_MS);

    let lastPaint = 0;
    root.__zzxBCTick = setInterval(() => {
      const now = Date.now();
      if (now - lastPaint < CFG.MIN_RENDER_INTERVAL_MS) return;
      lastPaint = now;
      render(root, state);
    }, CFG.TICK_MS);
  }

  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root) => boot(root));
  } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root) { boot(root); });
  }
})();
