// __partials/widgets/_shared/zzx-api.js
// ZZX-Labs shared widget API utilities — v4
// DROP-IN REPLACEMENT
//
// Contract:
// - Preserve the v3 public API.
// - Prefix-safe on root and deep GitHub Pages paths.
// - Pass through ordinary fetch() options.
// - Optional timeout/retry for idempotent reads.
// - No overlapping polling calls.
// - Stop polling automatically when a widget root is removed.
// - Single-path widget registration; safe across HUD reinjection.
// - No external dependencies.

(function () {
  "use strict";

  const W = window;
  const D = document;

  if (W.ZZXAPI && Number(W.ZZXAPI.__version || 0) >= 4) return;

  const timers = new WeakMap();

  // ---------------------------------------------------------------------------
  // Prefix / URL
  // ---------------------------------------------------------------------------
  function prefix() {
    let p = "";

    if (W.ZZX && typeof W.ZZX.PREFIX === "string") {
      p = W.ZZX.PREFIX;
    } else if (W.ZZX && typeof W.ZZX.prefix === "string") {
      p = W.ZZX.prefix;
    } else if (D.documentElement) {
      p = D.documentElement.getAttribute("data-zzx-prefix") || "";
    }

    p = String(p || "").trim();
    if (p === "." || p === "./" || p === "/") p = "";
    p = p.replace(/\/+$/g, "");

    W.ZZX = Object.assign({}, W.ZZX || {}, { PREFIX: p });
    return p;
  }

  function isAbsoluteOrSpecial(value) {
    const s = String(value || "");
    return /^[a-z][a-z0-9+.-]*:/i.test(s) || /^\/\//.test(s);
  }

  function url(path) {
    const value = String(path || "");
    if (!value) return value;
    if (isAbsoluteOrSpecial(value)) return value;
    if (!value.startsWith("/")) return value;

    const pre = prefix();
    return pre ? pre + value : value;
  }

  function bust(path) {
    const resolved = url(path);
    if (!resolved || /^data:|^blob:/i.test(resolved)) return resolved;

    const hashIndex = resolved.indexOf("#");
    const base = hashIndex >= 0 ? resolved.slice(0, hashIndex) : resolved;
    const hash = hashIndex >= 0 ? resolved.slice(hashIndex) : "";
    const sep = base.includes("?") ? "&" : "?";
    return base + sep + "t=" + Date.now() + hash;
  }

  function sleep(ms) {
    return new Promise(resolve => W.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  // ---------------------------------------------------------------------------
  // Fetch helpers
  // ---------------------------------------------------------------------------
  function retryableStatus(status) {
    return status === 408 || status === 425 || status === 429 ||
      status === 500 || status === 502 || status === 503 || status === 504;
  }

  function retryableMethod(method) {
    const m = String(method || "GET").toUpperCase();
    return m === "GET" || m === "HEAD";
  }

  function makeAbortContext(userSignal, timeoutMs) {
    const timeout = Math.max(0, Number(timeoutMs) || 0);

    if (!userSignal && timeout === 0) {
      return { signal: undefined, cleanup() {} };
    }

    if (typeof AbortController !== "function") {
      return { signal: userSignal, cleanup() {} };
    }

    const controller = new AbortController();
    let timeoutId = null;

    const forwardAbort = () => {
      try {
        controller.abort(userSignal && userSignal.reason);
      } catch (_) {
        try { controller.abort(); } catch (_) {}
      }
    };

    if (userSignal) {
      if (userSignal.aborted) {
        forwardAbort();
      } else {
        try { userSignal.addEventListener("abort", forwardAbort, { once: true }); } catch (_) {}
      }
    }

    if (timeout > 0) {
      timeoutId = W.setTimeout(() => {
        try { controller.abort(); } catch (_) {}
      }, timeout);
    }

    return {
      signal: controller.signal,
      cleanup() {
        if (timeoutId !== null) {
          W.clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (userSignal) {
          try { userSignal.removeEventListener("abort", forwardAbort); } catch (_) {}
        }
      }
    };
  }

  async function fetchRaw(path, opts) {
    const options = Object.assign({}, opts || {});

    const cacheBust = options.cacheBust !== false;
    const timeoutMs = Math.max(0, Number(options.timeoutMs) || 0);
    const retries = Math.max(0, Math.floor(Number(options.retries) || 0));
    const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 500);

    delete options.cacheBust;
    delete options.timeoutMs;
    delete options.retries;
    delete options.retryDelayMs;

    if (!("cache" in options)) options.cache = "no-store";
    if (!("credentials" in options)) options.credentials = "same-origin";
    if (!options.method) options.method = "GET";

    const userSignal = options.signal;
    delete options.signal;

    const methodCanRetry = retryableMethod(options.method);
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const requestURL = cacheBust ? bust(path) : url(path);
      const abort = makeAbortContext(userSignal, timeoutMs);
      let shouldRetry = false;

      try {
        const requestOptions = Object.assign({}, options);
        if (abort.signal) requestOptions.signal = abort.signal;

        const response = await fetch(requestURL, requestOptions);

        if (response.ok) {
          abort.cleanup();
          return response;
        }

        const error = new Error("HTTP " + response.status + " " + requestURL);
        error.status = response.status;
        error.response = response;
        lastError = error;

        shouldRetry = methodCanRetry && retryableStatus(response.status) && attempt < retries;
        abort.cleanup();

        if (!shouldRetry) throw error;
      } catch (error) {
        abort.cleanup();
        lastError = error;

        if (userSignal && userSignal.aborted) throw error;

        // HTTP failures carry a status. Respect the status-based decision above.
        if (error && Number.isFinite(Number(error.status))) {
          shouldRetry = methodCanRetry && retryableStatus(Number(error.status)) && attempt < retries;
        } else {
          // Network/timeout failure: retry only idempotent reads.
          shouldRetry = methodCanRetry && attempt < retries;
        }

        if (!shouldRetry) throw error;
      }

      await sleep(retryDelayMs * Math.pow(2, attempt));
    }

    throw lastError || new Error("Request failed: " + String(path || ""));
  }

  async function json(path, fallback, opts) {
    try {
      const r = await fetchRaw(path, opts);
      return await r.json();
    } catch (e) {
      console.warn("[ZZXAPI json]", path, e);
      return fallback;
    }
  }

  async function text(path, fallback, opts) {
    try {
      const r = await fetchRaw(path, opts);
      return await r.text();
    } catch (e) {
      console.warn("[ZZXAPI text]", path, e);
      return fallback == null ? "" : fallback;
    }
  }

  async function jsonStrict(path, opts) {
    const r = await fetchRaw(path, opts);
    return await r.json();
  }

  async function textStrict(path, opts) {
    const r = await fetchRaw(path, opts);
    return await r.text();
  }

  // ---------------------------------------------------------------------------
  // Numbers / formatting
  // ---------------------------------------------------------------------------
  function n(v, d) {
    const x = Number(v);
    return Number.isFinite(x) ? x : (d == null ? 0 : d);
  }

  function has(v) {
    return v !== null && v !== undefined && !(typeof v === "number" && Number.isNaN(v));
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, n(v)));
  }

  function int(v) {
    return Math.round(n(v)).toLocaleString();
  }

  function fixed(v, d) {
    d = d == null ? 2 : Math.max(0, Number(d) || 0);
    return n(v).toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  }

  function money(v, c, digits) {
    c = String(c || "USD").toUpperCase();
    digits = digits == null ? 2 : Math.max(0, Number(digits) || 0);

    try {
      return n(v).toLocaleString(undefined, {
        style: "currency",
        currency: c,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      });
    } catch (_) {
      return fixed(v, digits) + " " + c;
    }
  }

  function pct(v, d) {
    return fixed(v, d == null ? 2 : d) + "%";
  }

  function btc(v, d) {
    d = d == null ? 8 : Math.max(0, Number(d) || 0);
    return n(v).toLocaleString(undefined, { maximumFractionDigits: d }) + " BTC";
  }

  function sats(v) {
    return int(v) + " sat";
  }

  // Historical contract: despite its name this returns an absolute local timestamp.
  function ago(ts) {
    try {
      if (!ts) return "—";
      const d = new Date(ts);
      if (!Number.isFinite(d.getTime())) return "—";
      return d.toLocaleString();
    } catch (_) {
      return "—";
    }
  }

  function relative(ts) {
    try {
      if (!ts) return "—";
      const t = new Date(ts).getTime();
      if (!Number.isFinite(t)) return "—";

      const signed = Math.round((Date.now() - t) / 1000);
      const future = signed < 0;
      const sec = Math.abs(signed);

      let value;
      let unit;
      if (sec < 60) {
        value = sec; unit = "s";
      } else if (sec < 3600) {
        value = Math.floor(sec / 60); unit = "m";
      } else if (sec < 86400) {
        value = Math.floor(sec / 3600); unit = "h";
      } else {
        value = Math.floor(sec / 86400); unit = "d";
      }

      return future ? "in " + value + unit : value + unit + " ago";
    } catch (_) {
      return "—";
    }
  }

  // ---------------------------------------------------------------------------
  // DOM / markup
  // ---------------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
      }[m];
    });
  }

  function set(root, sel, val) {
    const e = root && root.querySelector(sel);
    if (e) e.textContent = !has(val) ? "—" : String(val);
  }

  // Raw HTML compatibility helper. Only use with trusted/generated markup.
  // Uses DOMParser + replaceChildren so the shared runtime contains no innerHTML writes.
  function html(root, sel, val) {
    const e = root && root.querySelector(sel);
    if (!e) return;
    if (val == null || val === "") {
      e.replaceChildren();
      return;
    }
    const parsed = new DOMParser().parseFromString(String(val), "text/html");
    const frag = D.createDocumentFragment();
    for (const node of Array.from(parsed.body.childNodes)) {
      frag.appendChild(D.importNode(node, true));
    }
    e.replaceChildren(frag);
  }

  function kv(rows) {
    return '<div class="btc-kv">' + (rows || []).map(function (r) {
      return (
        '<div class="btc-kv__row">' +
        '<span class="k">' + esc(r[0]) + "</span>" +
        '<span class="v">' + esc(r[1]) + "</span>" +
        "</div>"
      );
    }).join("") + "</div>";
  }

  function table(items, cols) {
    return '<div class="zzx-mini-table">' + (items || []).map(function (it, i) {
      return '<div class="zzx-mini-row">' + (cols || []).map(function (fn) {
        let value = "";
        try { value = fn(it, i); } catch (_) {}
        return "<span>" + esc(value) + "</span>";
      }).join("") + "</div>";
    }).join("") + "</div>";
  }

  function card(title, value, sub, body) {
    return (
      '<div class="btc-card">' +
      '<div class="btc-card__title">' + esc(title) + "</div>" +
      '<div class="btc-card__value">' + esc(value) + "</div>" +
      '<div class="btc-card__sub">' + esc(sub || "") + "</div>" +
      (body || "") +
      "</div>"
    );
  }

  function selectorValue(v) {
    return String(v || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function rootFor(ID) {
    const id = String(ID || "").trim();
    if (!id) return null;
    const safe = selectorValue(id);

    return (
      D.querySelector('[data-widget-root="' + safe + '"]') ||
      D.querySelector('[data-widget-slot="' + safe + '"]') ||
      D.querySelector('.btc-slot[data-widget="' + safe + '"]') ||
      D.querySelector('.btc-slot[data-widget-id="' + safe + '"]') ||
      null
    );
  }

  function renderWidgetError(root, ID, message) {
    if (!root) return;
    const parsed = new DOMParser().parseFromString(
      card(ID, "offline", message || "widget render error"),
      "text/html"
    );
    const frag = D.createDocumentFragment();
    for (const node of Array.from(parsed.body.childNodes)) {
      frag.appendChild(D.importNode(node, true));
    }
    root.replaceChildren(frag);
  }

  // ---------------------------------------------------------------------------
  // Widget registration
  // ---------------------------------------------------------------------------
  function register(ID, boot) {
    const id = String(ID || "").trim();
    if (!id || typeof boot !== "function") return false;

    function wrapped(root, core) {
      const r = root || rootFor(id);
      if (!r) return false;

      if (r.__zzxApiBootState === "booted" || r.__zzxApiBootState === "booting") {
        return true;
      }

      r.__zzxApiBootState = "booting";

      try {
        const result = boot(r, core || W.ZZXWidgetsCore || W.ZZXAPI);

        if (result && typeof result.then === "function") {
          return result.then(function (value) {
            r.__zzxApiBootState = "booted";
            return value;
          }).catch(function (e) {
            r.__zzxApiBootState = null;
            console.warn("[ZZXAPI widget]", id, e);
            renderWidgetError(r, id, "widget render error");
            return false;
          });
        }

        r.__zzxApiBootState = "booted";
        return result;
      } catch (e) {
        r.__zzxApiBootState = null;
        console.warn("[ZZXAPI widget]", id, e);
        renderWidgetError(r, id, "widget render error");
        return false;
      }
    }

    // Canonical lifecycle first. Use legacy registries only when core hooks are unavailable.
    if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
      W.ZZXWidgetsCore.onMount(id, wrapped);
    } else if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
      W.ZZXWidgets.register(id, wrapped);
    } else if (W.ZZXWidgetRegistry && typeof W.ZZXWidgetRegistry.register === "function") {
      W.ZZXWidgetRegistry.register(id, wrapped);
    } else if (W.__ZZX_WIDGETS && typeof W.__ZZX_WIDGETS.register === "function") {
      W.__ZZX_WIDGETS.register(id, wrapped);
    }

    // Standalone compatibility path.
    W.setTimeout(function () {
      const r = rootFor(id);
      if (r && !r.__zzxApiBootState) wrapped(r, W.ZZXWidgetsCore || W.ZZXAPI);
    }, 0);

    return true;
  }

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------
  function repeat(root, fn, ms, options) {
    if (!root || typeof fn !== "function") return null;

    stop(root);

    const interval = Math.max(250, Number(ms) || 60000);
    const opts = Object.assign({
      pauseWhenHidden: false,
      runImmediately: true
    }, options || {});

    const state = {
      timer: null,
      running: false,
      stopped: false,
      fn: fn,
      ms: interval,
      options: opts
    };

    timers.set(root, state);

    function schedule() {
      if (state.stopped) return;
      if (state.timer !== null) W.clearTimeout(state.timer);
      state.timer = W.setTimeout(tick, state.ms);
      root.__zzxInterval = state.timer;
    }

    async function tick() {
      if (state.stopped) return;

      if (!root.isConnected) {
        stop(root);
        return;
      }

      if (state.options.pauseWhenHidden && D.visibilityState === "hidden") {
        schedule();
        return;
      }

      if (state.running) {
        schedule();
        return;
      }

      state.running = true;
      try {
        await state.fn();
      } catch (e) {
        console.warn("[ZZXAPI repeat]", e);
      } finally {
        state.running = false;
      }

      schedule();
    }

    if (opts.runImmediately) {
      Promise.resolve().then(tick);
    } else {
      schedule();
    }

    return state;
  }

  function stop(root) {
    if (!root) return;

    const state = timers.get(root);
    if (state) {
      state.stopped = true;
      if (state.timer !== null) W.clearTimeout(state.timer);
      timers.delete(root);
    }

    if (root.__zzxInterval) {
      W.clearTimeout(root.__zzxInterval);
      W.clearInterval(root.__zzxInterval);
      root.__zzxInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  W.ZZXAPI = {
    __version: 4,

    prefix: prefix,
    url: url,
    bust: bust,

    json: json,
    text: text,
    jsonStrict: jsonStrict,
    textStrict: textStrict,
    fetchRaw: fetchRaw,

    n: n,
    has: has,
    clamp: clamp,
    money: money,
    int: int,
    fixed: fixed,
    pct: pct,
    btc: btc,
    sats: sats,
    ago: ago,
    relative: relative,

    set: set,
    html: html,
    esc: esc,
    kv: kv,
    table: table,
    card: card,

    register: register,
    repeat: repeat,
    stop: stop,
    rootFor: rootFor,

    sleep: sleep
  };
})();
