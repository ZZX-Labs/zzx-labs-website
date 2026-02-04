// __partials/widgets/tip-drift/widget.js
// Tip (height) + drift summary.
// DROP-IN: unified-runtime compatible + direct/AllOrigins fallback + no backend.
// Uses mempool.space only (no blockstream).
//
// Keeps your HTML exactly:
// - [data-val] height
// - [data-sub] "UTC + <tz> | mempool.space" or error
// - [data-since] minutes since tip + UTC + local timestamp
// - [data-avg] avg interval over last N blocks + drift vs 10m + last interval drift
//
// Updates every 15s.

(function () {
  "use strict";

  const W = window;
  const ID = "tip-drift";

  const CFG = {
    REFRESH_MS: 15_000,
    TIMEOUT_MS: 20_000,
    MEMPOOL_BASE: "https://mempool.space/api",
    AO_RAW: "https://api.allorigins.win/raw?url=",
    N_BLOCKS: 8
  };

  function q(root, sel) { return root ? root.querySelector(sel) : null; }
  function setText(root, sel, v) { const el = q(root, sel); if (el) el.textContent = String(v ?? "—"); }

  function fmt2(n) { return String(n).padStart(2, "0"); }

  function tzLabel() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"; }
    catch { return "Local"; }
  }

  function fmtLocal(tsSec) {
    try {
      const d = new Date(tsSec * 1000);
      return d.toLocaleString(undefined, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
    } catch { return "—"; }
  }

  function fmtUTC(tsSec) {
    const d = new Date(tsSec * 1000);
    if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
    return `${d.getUTCFullYear()}-${fmt2(d.getUTCMonth() + 1)}-${fmt2(d.getUTCDate())} ` +
           `${fmt2(d.getUTCHours())}:${fmt2(d.getUTCMinutes())}:${fmt2(d.getUTCSeconds())} UTC`;
  }

  function withTimeout(p, ms, label) {
    let t = null;
    const to = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error((label || "timeout") + " after " + ms + "ms")), ms);
    });
    return Promise.race([p, to]).finally(() => clearTimeout(t));
  }

  async function fetchTextDirect(url) {
    const r = await fetch(url, { cache: "no-store", credentials: "omit", redirect: "follow" });
    const txt = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return txt;
  }

  async function fetchTextDirectThenAO(url) {
    try {
      return await withTimeout(fetchTextDirect(url), CFG.TIMEOUT_MS, "fetch");
    } catch (e1) {
      const ao = CFG.AO_RAW + encodeURIComponent(String(url));
      try {
        return await withTimeout(fetchTextDirect(ao), CFG.TIMEOUT_MS, "fetch(ao)");
      } catch (e2) {
        throw new Error(`fetch failed: ${String(e1?.message || e1)} | ${String(e2?.message || e2)}`);
      }
    }
  }

  async function fetchJSONDirectThenAO(url) {
    const txt = await fetchTextDirectThenAO(url);
    const s = String(txt || "").trim();
    // AllOrigins returns raw body; still JSON for mempool endpoints
    try { return JSON.parse(s); }
    catch { throw new Error("JSON.parse failed"); }
  }

  async function getText(ctx, url) {
    if (ctx && typeof ctx.fetchText === "function") return await ctx.fetchText(url);
    return await fetchTextDirectThenAO(url);
  }

  async function getJSON(ctx, url) {
    if (ctx && typeof ctx.fetchJSON === "function") return await ctx.fetchJSON(url);
    return await fetchJSONDirectThenAO(url);
  }

  function colorizeAvg(el, avgMin) {
    if (!el) return;
    el.style.fontWeight = "700";
    if (avgMin > 10.25) el.style.color = "#ff4d4d";       // slow
    else if (avgMin < 9.75) el.style.color = "#c0d674";   // fast
    else el.style.color = "";
  }

  async function update(card, ctx, state) {
    if (!card || state.inflight) return;
    state.inflight = true;

    const tz = tzLabel();

    try {
      // Height
      const heightUrl = `${CFG.MEMPOOL_BASE}/blocks/tip/height`;
      const heightText = await getText(ctx, heightUrl);
      const h = parseInt(String(heightText).trim(), 10);

      setText(card, "[data-val]", Number.isFinite(h) ? String(h) : "—");
      setText(card, "[data-sub]", `UTC + ${tz} | mempool.space`);

      // Block list (timestamps)
      const blocksUrl = `${CFG.MEMPOOL_BASE}/blocks`;
      const arr = await getJSON(ctx, blocksUrl);
      const blocks = Array.isArray(arr) ? arr : [];

      const tip = blocks[0] || null;
      const tsTip = Number(tip?.timestamp);

      // since
      if (Number.isFinite(tsTip)) {
        const sinceSec = Math.max(0, Math.round(Date.now() / 1000 - tsTip));
        const sinceMin = sinceSec / 60;
        const utc = fmtUTC(tsTip);
        const loc = fmtLocal(tsTip);
        setText(card, "[data-since]", `+${sinceMin.toFixed(1)}m · ${utc} · ${tz}: ${loc}`);
      } else {
        setText(card, "[data-since]", "—");
      }

      // avg + drift
      const ts = blocks
        .slice(0, CFG.N_BLOCKS)
        .map(b => Number(b?.timestamp))
        .filter(Number.isFinite);

      const avgEl = q(card, "[data-avg]");

      if (ts.length >= 3) {
        const diffs = [];
        for (let i = 0; i < ts.length - 1; i++) diffs.push(ts[i] - ts[i + 1]);

        const avgSec = diffs.reduce((a, x) => a + x, 0) / diffs.length;
        const avgMin = avgSec / 60;

        const lastSec = diffs[0];
        const lastMin = lastSec / 60;

        const delta10 = avgMin - 10;
        const deltaLast = lastMin - 10;

        colorizeAvg(avgEl, avgMin);

        setText(
          card,
          "[data-avg]",
          `avg ${avgMin.toFixed(2)}m (Δ10 ${delta10 >= 0 ? "+" : ""}${delta10.toFixed(2)}m) · ` +
          `last ${lastMin.toFixed(2)}m (Δ10 ${deltaLast >= 0 ? "+" : ""}${deltaLast.toFixed(2)}m)`
        );
      } else {
        if (avgEl) { avgEl.style.color = ""; avgEl.style.fontWeight = ""; }
        setText(card, "[data-avg]", "—");
      }
    } catch (e) {
      setText(card, "[data-val]", "—");
      setText(card, "[data-sub]", `error: ${String(e?.message || e)}`);
      setText(card, "[data-since]", "—");
      const avgEl = q(card, "[data-avg]");
      if (avgEl) { avgEl.style.color = ""; avgEl.style.fontWeight = ""; }
      setText(card, "[data-avg]", "—");
    } finally {
      state.inflight = false;
    }
  }

  function boot(slotEl, ctx) {
    const card = slotEl?.querySelector?.('[data-w="tip-drift"]') || slotEl;
    if (!card) return;

    const state = (card.__zzxTipDriftState = card.__zzxTipDriftState || { inflight: false });

    if (card.__zzxTipDriftTimer) {
      clearInterval(card.__zzxTipDriftTimer);
      card.__zzxTipDriftTimer = null;
    }

    update(card, ctx, state);
    card.__zzxTipDriftTimer = setInterval(() => update(card, ctx, state), CFG.REFRESH_MS);
  }

  // Unified runtime
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (slotEl, ctx) => boot(slotEl, ctx));
    return;
  }

  // Legacy runtime
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, {
      mount(slotEl) { this._slot = slotEl; this._ctx = null; },
      start(ctx) { this._ctx = ctx; boot(this._slot, this._ctx); },
      stop() {
        const card = this._slot?.querySelector?.('[data-w="tip-drift"]') || this._slot;
        if (card?.__zzxTipDriftTimer) clearInterval(card.__zzxTipDriftTimer);
        if (card) card.__zzxTipDriftTimer = null;
      }
    });
  }
})();
