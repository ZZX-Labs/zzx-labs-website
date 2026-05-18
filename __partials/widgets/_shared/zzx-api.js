// __partials/widgets/_shared/zzx-api.js

(function () {
  "use strict";

  const W = window;
  const D = document;

  if (W.ZZXAPI && W.ZZXAPI.__version >= 3) return;

  const timers = new WeakMap();

  function prefix() {
    let p =
      (W.ZZX && (W.ZZX.PREFIX || W.ZZX.prefix)) ||
      D.documentElement.getAttribute("data-zzx-prefix") ||
      "";

    p = String(p || "").trim().replace(/\/+$/, "");

    if (p === "." || p === "./") return "";
    return p;
  }

  function url(p) {
    p = String(p || "");
    if (!p) return p;
    if (/^https?:\/\//i.test(p) || p.startsWith("data:") || p.startsWith("blob:")) return p;
    if (!p.startsWith("/")) return p;

    const pre = prefix();
    return pre ? pre + p : p;
  }

  function bust(p) {
    const u = url(p);
    if (!u || /^data:|^blob:/i.test(u)) return u;

    const sep = u.includes("?") ? "&" : "?";
    return u + sep + "t=" + Date.now();
  }

  async function fetchRaw(p, opts) {
    opts = opts || {};

    const r = await fetch(opts.cacheBust === false ? url(p) : bust(p), {
      cache: opts.cache || "no-store",
      credentials: opts.credentials || "same-origin",
      headers: opts.headers || {}
    });

    if (!r.ok) throw new Error("HTTP " + r.status + " " + p);
    return r;
  }

  async function json(p, fallback, opts) {
    try {
      const r = await fetchRaw(p, opts);
      return await r.json();
    } catch (e) {
      console.warn("[ZZXAPI json]", p, e);
      return fallback;
    }
  }

  async function text(p, fallback, opts) {
    try {
      const r = await fetchRaw(p, opts);
      return await r.text();
    } catch (e) {
      console.warn("[ZZXAPI text]", p, e);
      return fallback == null ? "" : fallback;
    }
  }

  function n(v, d) {
    v = Number(v);
    return Number.isFinite(v) ? v : (d == null ? 0 : d);
  }

  function has(v) {
    return v !== null && v !== undefined && !(typeof v === "number" && Number.isNaN(v));
  }

  function clamp(v, min, max) {
    v = n(v);
    return Math.min(max, Math.max(min, v));
  }

  function int(v) {
    return Math.round(n(v)).toLocaleString();
  }

  function fixed(v, d) {
    d = d == null ? 2 : d;
    return n(v).toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  }

  function money(v, c, digits) {
    c = c || "USD";
    digits = digits == null ? 2 : digits;

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
    d = d == null ? 8 : d;
    return n(v).toLocaleString(undefined, { maximumFractionDigits: d }) + " BTC";
  }

  function sats(v) {
    return int(v) + " sat";
  }

  function ago(ts) {
    try {
      if (!ts) return "—";
      return new Date(ts).toLocaleString();
    } catch (_) {
      return "—";
    }
  }

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

  function html(root, sel, val) {
    const e = root && root.querySelector(sel);
    if (e) e.innerHTML = val == null ? "" : String(val);
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
      return '<div class="zzx-mini-row">' + cols.map(function (fn) {
        return "<span>" + esc(fn(it, i)) + "</span>";
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

  function rootFor(ID) {
    return (
      D.querySelector('[data-widget-root="' + ID + '"]') ||
      D.querySelector('[data-widget-slot="' + ID + '"]') ||
      D.querySelector('.btc-slot[data-widget="' + ID + '"]') ||
      D.querySelector('[data-widget="' + ID + '"]')
    );
  }

  function register(ID, boot) {
    function wrapped(root, core) {
      const r = root || rootFor(ID);
      if (!r) return;

      try {
        r.__zzxApiBooted = 1;
        return boot(r, core || W.ZZXWidgetsCore || W.ZZXAPI);
      } catch (e) {
        console.warn("[ZZXAPI widget]", ID, e);
        r.innerHTML = card(ID, "offline", "widget render error");
      }
    }

    if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
      W.ZZXWidgetsCore.onMount(ID, wrapped);
    }

    if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
      W.ZZXWidgets.register(ID, wrapped);
    }

    setTimeout(function () {
      const r = rootFor(ID);
      if (r && !r.__zzxApiBooted) wrapped(r, W.ZZXWidgetsCore || W.ZZXAPI);
    }, 0);
  }

  function repeat(root, fn, ms) {
    if (!root) return;

    const old = timers.get(root);
    if (old) clearInterval(old);

    fn();

    const t = setInterval(fn, ms || 60000);
    timers.set(root, t);
    root.__zzxInterval = t;
    return t;
  }

  function stop(root) {
    const t = timers.get(root);
    if (t) clearInterval(t);
    timers.delete(root);

    if (root && root.__zzxInterval) {
      clearInterval(root.__zzxInterval);
      root.__zzxInterval = null;
    }
  }

  W.ZZXAPI = {
    __version: 3,
    prefix: prefix,
    url: url,
    bust: bust,
    json: json,
    text: text,
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
    set: set,
    html: html,
    esc: esc,
    kv: kv,
    table: table,
    card: card,
    register: register,
    repeat: repeat,
    stop: stop,
    rootFor: rootFor
  };
})();
