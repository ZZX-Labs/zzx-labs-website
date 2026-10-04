// __partials/widgets/bitrng/widget.js
// Primary BitRNG controller. Loads and coordinates all local JS submodules.

(function () {
  "use strict";

  const ID = "bitrng";
  const W = window;
  const D = document;

  const STORE = {
    engine: "zzx.bitrng.engine",
    mode: "zzx.bitrng.mode",
    format: "zzx.bitrng.format",
    auto: "zzx.bitrng.auto"
  };

  function safeGet(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) {}
  }

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function assetVersion() {
    const meta = D.querySelector('meta[name="asset-version"]');
    return meta ? String(meta.getAttribute("content") || "").trim() : "";
  }

  function resolveLocal(path, core) {
    const local = `/__partials/widgets/bitrng/${path.replace(/^\/+/, "")}`;
    let resolved = local;

    if (core && typeof core.url === "function") resolved = core.url(local);
    else if (W.ZZXAPI && typeof W.ZZXAPI.url === "function") resolved = W.ZZXAPI.url(local);
    else {
      let prefix = W.ZZX?.PREFIX || D.documentElement?.getAttribute("data-zzx-prefix") || "";
      prefix = String(prefix).trim();
      if (prefix === "." || prefix === "./" || prefix === "/") prefix = "";
      prefix = prefix.replace(/\/+$/, "");
      resolved = prefix ? prefix + local : local;
    }

    const version = assetVersion();
    if (!version) return resolved;

    try {
      const u = new URL(resolved, location.href);
      if (!u.searchParams.has("v")) u.searchParams.set("v", version);
      return u.href;
    } catch (_) {
      return resolved;
    }
  }

  let modulePromise = null;
  function loadModules(core) {
    if (!modulePromise) {
      modulePromise = Promise.all([
        import(resolveLocal("entropy.js", core)),
        import(resolveLocal("engines/index.js", core)),
        import(resolveLocal("format.js", core))
      ]).then(([entropy, engines, format]) => ({ entropy, engines, format }));
    }
    return modulePromise;
  }

  function defaultFetchJSON(url) {
    return fetch(url, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    });
  }

  function defaultFetchText(url) {
    return fetch(url, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
  }

  function getFetchers(core) {
    const ctx = core?.ctx || core || {};
    const api = W.ZZXAPI || {};

    return {
      fetchJSON:
        typeof ctx.fetchJSON === "function" ? (url) => ctx.fetchJSON(url) :
        typeof api.jsonStrict === "function" ? (url) => api.jsonStrict(url) :
        defaultFetchJSON,

      fetchText:
        typeof ctx.fetchText === "function" ? (url) => ctx.fetchText(url) :
        typeof api.textStrict === "function" ? (url) => api.textStrict(url) :
        defaultFetchText
    };
  }

  function setState(root, state, text) {
    const stateEl = q(root, ".bitrng__state");
    const textEl = q(root, "[data-bitrng-state-text]");
    if (stateEl) stateEl.setAttribute("data-bitrng-state", state);
    if (textEl) textEl.textContent = text || state;
  }

  function setText(root, selector, value) {
    const el = q(root, selector);
    if (el) el.textContent = value == null || value === "" ? "—" : String(value);
  }

  function networkLabel(network) {
    if (!network?.available) return "offline / not needed";
    const parts = [];
    if (Number.isFinite(network.tipHeight)) parts.push(`#${network.tipHeight.toLocaleString()}`);
    if (Number.isFinite(network.mempoolCount)) parts.push(`${network.mempoolCount.toLocaleString()} tx`);
    return parts.length ? parts.join(" · ") : "mempool.space context";
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);

    return new Promise((resolve, reject) => {
      try {
        const ta = D.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        D.body.appendChild(ta);
        ta.select();
        const ok = D.execCommand("copy");
        ta.remove();
        ok ? resolve() : reject(new Error("copy command failed"));
      } catch (error) {
        reject(error);
      }
    });
  }

  async function boot(root, core) {
    if (!root || root.__zzxBitrngBooted) return;
    root.__zzxBitrngBooted = true;

    const engineSelect = q(root, "[data-bitrng-engine]");
    const modeSelect = q(root, "[data-bitrng-mode]");
    const formatSelect = q(root, "[data-bitrng-format]");
    const autoSelect = q(root, "[data-bitrng-auto]");
    const generateButton = q(root, '[data-bitrng-action="generate"]');
    const copyButton = q(root, '[data-bitrng-action="copy"]');
    const notice = q(root, "[data-bitrng-notice]");

    if (!engineSelect || !modeSelect || !formatSelect || !autoSelect) return;

    let modules;
    try {
      modules = await loadModules(core);
    } catch (error) {
      setState(root, "error", "module error");
      if (notice) notice.textContent = `BitRNG module load failed: ${error?.message || error}`;
      return;
    }

    const { entropy, engines, format } = modules;
    const fetchers = getFetchers(core);
    const engineList = engines.listEngines();

    engineSelect.replaceChildren();
    for (const engine of engineList) {
      const option = D.createElement("option");
      option.value = engine.id;
      option.textContent = engine.title || engine.id;
      engineSelect.appendChild(option);
    }

    function syncModes(preferred) {
      const engine = engines.getEngine(engineSelect.value);
      const modes = engine?.modes?.length ? engine.modes : ["default"];
      modeSelect.replaceChildren();

      for (const mode of modes) {
        const option = D.createElement("option");
        option.value = mode;
        option.textContent = mode;
        modeSelect.appendChild(option);
      }

      const wanted = preferred || safeGet(STORE.mode, modes[0]);
      modeSelect.value = modes.includes(wanted) ? wanted : modes[0];
      safeSet(STORE.mode, modeSelect.value);

      const dice = engineSelect.value === "polyhedra";
      formatSelect.disabled = dice;
      setText(root, "[data-bitrng-output-kind]", dice ? "dice" : formatSelect.value);
    }

    const savedEngine = safeGet(STORE.engine, engineList[0]?.id || "raw");
    engineSelect.value = engineList.some((engine) => engine.id === savedEngine) ? savedEngine : (engineList[0]?.id || "raw");

    const savedFormat = safeGet(STORE.format, "hex");
    formatSelect.value = ["hex", "base64", "base32"].includes(savedFormat) ? savedFormat : "hex";

    const savedAuto = safeGet(STORE.auto, "0");
    autoSelect.value = Array.from(autoSelect.options).some((option) => option.value === savedAuto) ? savedAuto : "0";

    syncModes();

    let running = false;
    let rerun = false;
    let lastText = "";
    let autoTimer = null;

    function clearAuto() {
      if (autoTimer !== null) {
        W.clearTimeout(autoTimer);
        autoTimer = null;
      }
    }

    function scheduleAuto() {
      clearAuto();
      const delay = Number(autoSelect.value || 0);
      if (!delay || !root.isConnected) return;
      autoTimer = W.setTimeout(async () => {
        autoTimer = null;
        await generate();
        scheduleAuto();
      }, delay);
    }

    async function generate() {
      if (running) {
        rerun = true;
        return;
      }

      running = true;
      if (generateButton) generateButton.disabled = true;
      setState(root, "running", "generating");

      try {
        const snapshot = await entropy.getEntropySnapshot(fetchers);
        const engine = engines.getEngine(engineSelect.value);
        if (!engine) throw new Error(`engine not found: ${engineSelect.value}`);

        const raw = await engine.run({
          mode: modeSelect.value,
          entropyBytes: snapshot.entropyBytes,
          snapshot,
          ctx: fetchers
        });

        const rendered = format.render(raw, { kind: formatSelect.value });
        lastText = rendered.text;

        setText(root, "[data-bitrng-value]", rendered.text);
        setText(root, "[data-bitrng-output-kind]", rendered.kind);
        setText(root, "[data-bitrng-bits]", rendered.bits ? `${rendered.bits.toLocaleString()} bits` : "dice output");
        setText(root, "[data-bitrng-updated]", new Date(snapshot.generatedAt).toLocaleTimeString());
        setText(root, "[data-bitrng-source]", snapshot.source);
        setText(root, "[data-bitrng-network]", networkLabel(snapshot.network));
        setText(root, "[data-bitrng-health]", snapshot.health);
        setText(root, "[data-bitrng-entropy]", `${snapshot.bits} bits mixed seed`);

        setState(root, "ready", "ready");
        if (notice) notice.textContent = rendered.hint || "generated";
      } catch (error) {
        lastText = "";
        setText(root, "[data-bitrng-value]", "—");
        setState(root, "error", "error");
        if (notice) notice.textContent = `BitRNG error: ${error?.message || error}`;
      } finally {
        running = false;
        if (generateButton) generateButton.disabled = false;

        if (rerun) {
          rerun = false;
          await generate();
        }
      }
    }

    engineSelect.addEventListener("change", async () => {
      safeSet(STORE.engine, engineSelect.value);
      syncModes();
      await generate();
    });

    modeSelect.addEventListener("change", async () => {
      safeSet(STORE.mode, modeSelect.value);
      await generate();
    });

    formatSelect.addEventListener("change", async () => {
      safeSet(STORE.format, formatSelect.value);
      await generate();
    });

    autoSelect.addEventListener("change", () => {
      safeSet(STORE.auto, autoSelect.value);
      scheduleAuto();
    });

    generateButton?.addEventListener("click", generate);

    copyButton?.addEventListener("click", async () => {
      if (!lastText) return;
      try {
        await copyText(lastText);
        if (notice) notice.textContent = "copied to clipboard";
      } catch (error) {
        if (notice) notice.textContent = `copy failed: ${error?.message || error}`;
      }
    });

    root.__zzxBitrngStop = clearAuto;

    await generate();
    scheduleAuto();
  }

  function register() {
    if (W.ZZXAPI && typeof W.ZZXAPI.register === "function") {
      W.ZZXAPI.register(ID, boot);
      return;
    }

    if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
      W.ZZXWidgetsCore.onMount(ID, boot);
      return;
    }

    if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
      W.ZZXWidgets.register(ID, boot);
      return;
    }

    const root = D.querySelector('[data-widget-root="bitrng"], .bitrng[data-bitrng-root]');
    if (root) boot(root, W.ZZXWidgetsCore || W.ZZXAPI || {});
  }

  register();
})();
