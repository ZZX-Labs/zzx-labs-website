// __partials/widgets/mempool-specs/themes.js
// DROP-IN COMPLETE REPLACEMENT
//
// Theme system for mempool-specs with LOCAL JSON THEMES.
//
// Requirements satisfied:
// - Themes live in:  __partials/widgets/mempool-specs/themes/*.json
// - Each JSON can define: fonts, colors, tiers, styling, layout knobs, etc.
// - Theme selection is “settings-ready” (we only provide the plumbing now).
// - Respects global ZZXTheme override if present.
// - Fail-soft: if JSON missing/blocked, falls back to built-in defaults.
// - Caches loaded JSON in-memory + localStorage (fast, avoids refetch spam).
//
// Exposes:
//   window.ZZXMempoolSpecs.Theme
//     - get()                      -> normalized theme (current)
//     - setThemeId(id)             -> set preferred theme id (settings can call later)
//     - listLocalThemes()          -> returns configured local theme ids
//     - load(id)                   -> async load a local theme JSON
//     - colorForFeeRate(satvb, t?) -> fee->color
//
// Notes:
// - This module does NOT force-load a theme immediately. Widget.js may call
//   Theme.load(...) optionally; otherwise Theme.get() returns defaults.
// - You can add more knobs later without touching consumers; normalization
//   keeps backward compatibility.

(function () {
  "use strict";

  const W = window;
  const NS = (W.ZZXMempoolSpecs = W.ZZXMempoolSpecs || {});
  const ThemeNS = (NS.Theme = NS.Theme || {});

  // ------------------------------------------------------------
  // Defaults (always available, also used as merge base)
  // ------------------------------------------------------------
  const FALLBACK = {
    id: "zzx-default",
    label: "ZZX Default",

    fonts: {
      mono: "IBMPlexMono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      ui:   "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    },

    colors: {
      canvasBg: "#000000",
      border:   "#e6a42b",
      text:     "#c0d674",
      muted:    "rgba(192,214,116,0.70)",
      gridLine: "rgba(255,255,255,0.06)",
      tileOutline: "rgba(255,255,255,0.08)"
    },

    // Fee tiers (sat/vB) — ordered low → high
    tiers: [
      { min:   0, color: "#1e2b32" }, // dust / idle
      { min:   2, color: "#243f4a" },
      { min:   5, color: "#2f6f5a" },
      { min:  10, color: "#4b9a6a" },
      { min:  20, color: "#6bb36d" },
      { min:  40, color: "#9fb84b" },
      { min:  80, color: "#c0d674" }, // equilibrium
      { min: 150, color: "#e6a42b" }, // congestion
      { min: 300, color: "#ff4d4d" }  // panic
    ],

    markers: {
      hiColor: "#e6a42b",
      loColor: "#2b7cff"
    },

    // Styling/layout knobs (future use by renderer/widget.js)
    style: {
      tileRadiusCss: 3,
      frameWidthCss: 4,
      metaOpacity: 0.9
    }
  };

  // ------------------------------------------------------------
  // Local theme directory + registry (edit this list as you add files)
  // ------------------------------------------------------------
  const THEME_DIR = "themes/"; // relative to widget base
  const LOCAL_THEME_IDS = [
    // These are FILE BASENAMES under themes/, without ".json"
    // Add more as you create them.
    "zzx-default"
    // "zzx-midnight",
    // "zzx-amber",
    // "zzx-mono"
  ];

  // ------------------------------------------------------------
  // Storage keys + in-memory caches
  // ------------------------------------------------------------
  const LS_KEY_SELECTED = "zzx:mempool-specs:theme:selected";
  const LS_KEY_CACHE_PREFIX = "zzx:mempool-specs:theme:cache:";

  const memCache = new Map();   // id -> theme object (raw)
  const inflight = new Map();   // id -> Promise<theme>

  function safeJSONParse(s) {
    try { return JSON.parse(String(s)); } catch { return null; }
  }

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------
  // Base path detection (works with your Core if present)
  // ------------------------------------------------------------
  function widgetBasePath() {
    const Core = W.ZZXWidgetsCore;
    if (Core?.widgetBase) {
      return String(Core.widgetBase("mempool-specs")).replace(/\/+$/, "") + "/";
    }
    return "/__partials/widgets/mempool-specs/";
  }

  function themeUrl(id) {
    // Allow user to pass explicit URL later if desired
    if (/^https?:\/\//i.test(String(id))) return String(id);
    const base = widgetBasePath();
    return base + THEME_DIR + String(id) + ".json";
  }

  // ------------------------------------------------------------
  // Normalize / merge / compat
  // ------------------------------------------------------------
  function normalizeTheme(t) {
    // Accept either:
    // - new schema: { id,label, fonts:{}, colors:{}, tiers:[], markers:{}, style:{} }
    // - legacy schema: { canvasBg,border,text,muted,gridLine,tileOutline, tiers:[] }
    const raw = (t && typeof t === "object") ? t : {};

    // Legacy flatten support
    const legacyColors = {};
    for (const k of ["canvasBg","border","text","muted","gridLine","tileOutline"]) {
      if (raw[k] != null && typeof raw[k] !== "object") legacyColors[k] = raw[k];
    }

    const out = {
      ...FALLBACK,
      ...raw,
      fonts: { ...FALLBACK.fonts, ...(raw.fonts || {}) },
      colors: { ...FALLBACK.colors, ...(raw.colors || {}), ...legacyColors },
      markers: { ...FALLBACK.markers, ...(raw.markers || {}) },
      style: { ...FALLBACK.style, ...(raw.style || {}) }
    };

    // Normalize tiers
    if (Array.isArray(out.tiers)) {
      out.tiers = out.tiers
        .map((x, i) => {
          if (typeof x === "string") return { min: i * 10, color: x };
          if (x && typeof x === "object") {
            return { min: Number(x.min ?? 0), color: String(x.color || "#888") };
          }
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.min - b.min);
    } else {
      out.tiers = FALLBACK.tiers.slice();
    }

    // Ensure id/label
    out.id = String(out.id || raw.id || "zzx-default");
    out.label = String(out.label || out.id);

    return out;
  }

  // ------------------------------------------------------------
  // Global theme override (highest priority)
  // ------------------------------------------------------------
  function getGlobalOverride() {
    // Expected: window.ZZXTheme.widgets.mempoolSpecs may contain:
    // - direct theme object, OR
    // - { themeId: "zzx-default" } (future)
    const t = W.ZZXTheme?.widgets?.mempoolSpecs;
    if (!t || typeof t !== "object") return null;
    return t;
  }

  // ------------------------------------------------------------
  // Fetch layer (uses mempool-specs fetch module if present, else fetch)
  // ------------------------------------------------------------
  async function fetchThemeJSON(url) {
    // Prefer your robust fetch.js if available:
    // window.ZZXMempoolSpecsFetch.fetchJSON(url)
    const F = W.ZZXMempoolSpecsFetch?.fetchJSON;
    if (typeof F === "function") {
      const r = await F(url);
      return r?.json ?? null;
    }

    const res = await fetch(url, { cache: "no-store", credentials: "omit" });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 140)}`);
    return safeJSONParse(text);
  }

  // ------------------------------------------------------------
  // Public: list + selection
  // ------------------------------------------------------------
  ThemeNS.listLocalThemes = function listLocalThemes() {
    return LOCAL_THEME_IDS.slice();
  };

  ThemeNS.getSelectedThemeId = function getSelectedThemeId() {
    const v = lsGet(LS_KEY_SELECTED);
    if (v && LOCAL_THEME_IDS.includes(v)) return v;
    return "zzx-default";
  };

  ThemeNS.setThemeId = function setThemeId(id) {
    const s = String(id || "").trim();
    if (!s) return false;
    // allow unknown ids too (future), but prefer local registry
    lsSet(LS_KEY_SELECTED, s);
    return true;
  };

  // ------------------------------------------------------------
  // Public: async load local JSON theme by id
  // ------------------------------------------------------------
  ThemeNS.load = async function load(id) {
    const themeId = String(id || "").trim() || "zzx-default";

    // Global override might specify a theme object, so "load" can just normalize it.
    const glob = getGlobalOverride();
    if (glob && glob.theme && typeof glob.theme === "object") {
      const norm = normalizeTheme(glob.theme);
      memCache.set(norm.id, norm);
      return norm;
    }

    // Memory cache
    if (memCache.has(themeId)) return memCache.get(themeId);

    // localStorage cache (raw)
    const rawCached = lsGet(LS_KEY_CACHE_PREFIX + themeId);
    if (rawCached) {
      const obj = safeJSONParse(rawCached);
      if (obj && typeof obj === "object") {
        const norm = normalizeTheme(obj);
        memCache.set(themeId, norm);
        return norm;
      }
    }

    // Coalesce inflight
    if (inflight.has(themeId)) return inflight.get(themeId);

    const p = (async () => {
      const url = themeUrl(themeId);
      const json = await fetchThemeJSON(url);
      if (!json || typeof json !== "object") throw new Error(`theme JSON invalid: ${themeId}`);
      lsSet(LS_KEY_CACHE_PREFIX + themeId, JSON.stringify(json));
      const norm = normalizeTheme(json);
      memCache.set(themeId, norm);
      return norm;
    })();

    inflight.set(themeId, p);

    try {
      return await p;
    } finally {
      inflight.delete(themeId);
    }
  };

  // ------------------------------------------------------------
  // Public: get current theme (sync, fail-soft)
  // ------------------------------------------------------------
  ThemeNS.get = function get() {
    const glob = getGlobalOverride();

    // If global override provides an inline theme, use it immediately.
    if (glob && glob.theme && typeof glob.theme === "object") {
      return normalizeTheme(glob.theme);
    }

    // If global override declares a themeId, prefer that.
    const forcedId = (glob && typeof glob.themeId === "string") ? glob.themeId : null;
    const id = forcedId || ThemeNS.getSelectedThemeId();

    // If already loaded in memory, return it. Otherwise return FALLBACK immediately.
    if (memCache.has(id)) return memCache.get(id);

    // Try cached JSON from localStorage (sync)
    const rawCached = lsGet(LS_KEY_CACHE_PREFIX + id);
    if (rawCached) {
      const obj = safeJSONParse(rawCached);
      if (obj && typeof obj === "object") {
        const norm = normalizeTheme(obj);
        memCache.set(id, norm);
        return norm;
      }
    }

    // Default
    return normalizeTheme(FALLBACK);
  };

  // ------------------------------------------------------------
  // Fee-rate -> color
  // ------------------------------------------------------------
  ThemeNS.colorForFeeRate = function colorForFeeRate(satPerVb, theme) {
    const fee = Number(satPerVb);
    const t = normalizeTheme(theme || ThemeNS.get());

    if (!Number.isFinite(fee) || fee < 0) return t.tiers[0].color;

    let color = t.tiers[0].color;
    for (const tier of t.tiers) {
      if (fee >= tier.min) color = tier.color;
      else break;
    }
    return color;
  };

  // ------------------------------------------------------------
  // Optional convenience: warm-load selected theme in background (non-blocking)
  // ------------------------------------------------------------
  // Consumers (widget.js) can call Theme.warm() once at boot if desired.
  ThemeNS.warm = function warm() {
    const glob = getGlobalOverride();
    const forcedId = (glob && typeof glob.themeId === "string") ? glob.themeId : null;
    const id = forcedId || ThemeNS.getSelectedThemeId();
    // fire-and-forget
    ThemeNS.load(id).catch(() => {});
  };

  // ------------------------------------------------------------
  // JSON theme file format (reference)
  // ------------------------------------------------------------
  // Example: __partials/widgets/mempool-specs/themes/zzx-default.json
  //
  // {
  //   "id": "zzx-default",
  //   "label": "ZZX Default",
  //   "fonts": { "mono": "IBMPlexMono, monospace", "ui": "system-ui, sans-serif" },
  //   "colors": {
  //     "canvasBg": "#000000",
  //     "border": "#e6a42b",
  //     "text": "#c0d674",
  //     "muted": "rgba(192,214,116,0.70)",
  //     "gridLine": "rgba(255,255,255,0.06)",
  //     "tileOutline": "rgba(255,255,255,0.08)"
  //   },
  //   "tiers": [
  //     { "min": 0, "color": "#1e2b32" },
  //     { "min": 80, "color": "#c0d674" },
  //     { "min": 150, "color": "#e6a42b" },
  //     { "min": 300, "color": "#ff4d4d" }
  //   ],
  //   "markers": { "hiColor": "#e6a42b", "loColor": "#2b7cff" },
  //   "style": { "tileRadiusCss": 3, "frameWidthCss": 4, "metaOpacity": 0.9 }
  // }

})();
