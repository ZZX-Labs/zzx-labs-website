// __partials/widgets/bitrng/widget.js
// DROP-IN REPLACEMENT — BitRNG wrapper/orchestrator
// - widget.js loads local subprograms (entropy + engines + formatting)
// - persists engine/mode/output in localStorage
// - uses ctx.fetchJSON if provided by widget-core, else fetch()
// - NO remote fonts, no runtime widget, no other dependencies

(function () {
  "use strict";

  const ID = "bitrng";
  const W = window;

  const KEY = {
    engine: "zzx.bitrng.engine",
    mode:   "zzx.bitrng.mode",
    output: "zzx.bitrng.output",
  };

  function safeGet(k, fallback = "") {
    try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; }
  }
  function safeSet(k, v) {
    try { localStorage.setItem(k, String(v)); } catch {}
  }

  // --- Lazy module loader (local files in this widget directory) ---
  async function loadModules() {
    // Keep these relative paths INSIDE widget folder.
    const base = "/__partials/widgets/bitrng/";

    const [entropy, engines, format] = await Promise.all([
      import(base + "entropy.js"),
      import(base + "engines/index.js"),
      import(base + "format.js"),
    ]);

    return { entropy, engines, format };
  }

  function q(root, sel) { return root ? root.querySelector(sel) : null; }

  async function boot(root, ctx) {
    if (!root) return;

    const outValue  = q(root, "[data-bitrng-value]");
    const outSub    = q(root, "[data-bitrng-sub]");
    const outSource = q(root, "[data-bitrng-source]");
    const outHealth = q(root, "[data-bitrng-health]");
    const outRate   = q(root, "[data-bitrng-rate]");
    const hint      = q(root, "[data-bitrng-hint]");

    const selEngine = q(root, "[data-bitrng-engine]");
    const selMode   = q(root, "[data-bitrng-mode]");
    const selOutput = q(root, "[data-bitrng-output]");

    const btnRefresh = q(root, '[data-bitrng-action="refresh"]');
    const btnCopy    = q(root, '[data-bitrng-action="copy"]');

    if (!outValue || !selEngine || !selMode || !selOutput) return;

    // Ensure we don’t double-bind if reinjected
    if (root.__zzxBitrngBound) return;
    root.__zzxBitrngBound = true;

    // Provide fetch helpers (core-compatible)
    const fetchJSON = (ctx && typeof ctx.fetchJSON === "function")
      ? (u) => ctx.fetchJSON(u)
      : async (u) => {
          const r = await fetch(u, { cache: "no-store" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          return await r.json();
        };

    const fetchText = (ctx && typeof ctx.fetchText === "function")
      ? (u) => ctx.fetchText(u)
      : async (u) => {
          const r = await fetch(u, { cache: "no-store" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          return await r.text();
        };

    let mods;
    try {
      mods = await loadModules();
    } catch (e) {
      if (hint) hint.textContent = "module load failed (check paths): " + String(e?.message || e);
      return;
    }

    const { entropy, engines, format } = mods;

    // Engines registry: { id, title, modes:[...], run({entropyBytes, mode, ctx}) -> Uint8Array|string|object }
    const engineList = engines.listEngines();

    // Populate engine select
    selEngine.replaceChildren();
    for (const eng of engineList) {
      const opt = document.createElement("option");
      opt.value = eng.id;
      opt.textContent = eng.title || eng.id;
      selEngine.appendChild(opt);
    }

    function setModesForEngine(engineId) {
      const eng = engines.getEngine(engineId);
      const modes = (eng && Array.isArray(eng.modes) && eng.modes.length) ? eng.modes : ["default"];

      selMode.replaceChildren();
      for (const m of modes) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        selMode.appendChild(opt);
      }
    }

    // Restore saved selections
    const savedEngine = safeGet(KEY.engine, engineList[0]?.id || "hash-sha256");
    selEngine.value = savedEngine;

    setModesForEngine(selEngine.value);

    const savedMode = safeGet(KEY.mode, selMode.options[0]?.value || "default");
    selMode.value = savedMode;

    const savedOut = safeGet(KEY.output, selOutput.value || "hex");
    selOutput.value = savedOut;

    // Persist on change
    selEngine.addEventListener("change", () => {
      safeSet(KEY.engine, selEngine.value);
      setModesForEngine(selEngine.value);
      safeSet(KEY.mode, selMode.value);
      generate();
    });

    selMode.addEventListener("change", () => {
      safeSet(KEY.mode, selMode.value);
      generate();
    });

    selOutput.addEventListener("change", () => {
      safeSet(KEY.output, selOutput.value);
      generate();
    });

    // --- core action: build entropy -> run engine -> format -> display ---
    let lastOutputText = "";

    async function generate() {
      try {
        outValue.textContent = "…";
        if (hint) hint.textContent = "running…";

        // 1) entropy snapshot (TX + tip + local jitter)
        const snap = await entropy.getEntropySnapshot({
          fetchJSON,
          fetchText,
        });

        // 2) choose engine+mode
        const engineId = selEngine.value;
        const mode = selMode.value;

        const eng = engines.getEngine(engineId);
        if (!eng) throw new Error("engine not found: " + engineId);

        // 3) run engine (returns bytes or structured output)
        const raw = await eng.run({
          mode,
          entropyBytes: snap.entropyBytes, // Uint8Array
          snapshot: snap,                  // metadata
          ctx: { fetchJSON, fetchText },   // future-proof
        });

        // 4) format output (hex/base64/dice)
        const outputKind = selOutput.value;
        const rendered = format.render(raw, { kind: outputKind });

        lastOutputText = rendered.text;

        outValue.textContent = rendered.text;
        outSub.textContent = `entropy · ${new Date().toLocaleTimeString()}`;

        outSource.textContent = snap.source;
        outHealth.textContent = snap.health;
        outRate.textContent = snap.rate;

        if (hint) hint.textContent = rendered.hint || "ok";
      } catch (e) {
        outValue.textContent = "—";
        if (hint) hint.textContent = "error: " + String(e?.message || e);
      }
    }

    btnRefresh?.addEventListener("click", generate);

    btnCopy?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(lastOutputText || "");
        if (hint) hint.textContent = "copied to clipboard";
      } catch {
        if (hint) hint.textContent = "copy failed";
      }
    });

    // first run
    await generate();
  }

  // Mount in both systems (core + legacy)
  if (W.ZZXWidgetsCore && typeof W.ZZXWidgetsCore.onMount === "function") {
    W.ZZXWidgetsCore.onMount(ID, (root, ctx) => boot(root, ctx));
  }
  if (W.ZZXWidgets && typeof W.ZZXWidgets.register === "function") {
    W.ZZXWidgets.register(ID, function (root, ctx) { boot(root, ctx); });
  }
})();
