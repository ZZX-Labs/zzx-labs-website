// __partials/widgets/btc-blockexplorer/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "btc-blockexplorer";

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function status(root, label, state) {
    const el = q(root, "[data-bex-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  function setMetric(root, index, label, value) {
    const l = q(root, `[data-bex-metric-label="${index}"]`);
    const v = q(root, `[data-bex-metric-value="${index}"]`);
    if (l) l.textContent = label;
    if (v) v.textContent = value;
  }

  function renderDetails(root, rows) {
    const box = q(root, "[data-bex-details]");
    if (!box) return;

    box.replaceChildren();

    for (const [label, value] of rows || []) {
      const row = D.createElement("div");
      row.className = "btc-blockexplorer__row";

      const k = D.createElement("span");
      k.textContent = String(label);

      const v = D.createElement("span");
      v.textContent = String(value ?? "—");
      v.title = String(value ?? "—");

      row.append(k, v);
      box.appendChild(row);
    }
  }

  function render(root, model) {
    q(root, "[data-bex-type]").textContent =
      model.kind === "tx"
        ? "Transaction"
        : model.kind === "block"
          ? "Block"
          : "Bitcoin address";

    q(root, "[data-bex-hero-label]").textContent =
      model.kind === "tx"
        ? "transaction ID"
        : model.kind === "block"
          ? "block"
          : "address";

    const hero = q(root, "[data-bex-hero]");
    hero.textContent = model.hero || "—";
    hero.title = model.hero || "";

    q(root, "[data-bex-hero-sub]").textContent =
      model.kind === "tx"
        ? (model.confirmed ? "confirmed transaction" : "unconfirmed transaction")
        : model.kind === "block"
          ? "confirmed Bitcoin block"
          : "on-chain address summary";

    for (let i = 0; i < 4; i++) {
      const pair = model.metrics?.[i] || ["metric", "—"];
      setMetric(root, i, pair[0], pair[1]);
    }

    renderDetails(root, model.details || []);

    const external = q(root, "[data-bex-external]");
    if (external) external.href = model.external || "https://mempool.space/";

    q(root, "[data-bex-meta]").textContent =
      `resolved locally in widget via configured mempool API · ${model.kind}`;

    status(root, "live", "ok");
  }

  async function ensureExplorer(core) {
    if (W.ZZXBlockExplorer?.explore) return;

    const base = core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g, "")
      : "/__partials/widgets/btc-blockexplorer";

    const src = W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/explorer.js`)
      : `${base}/js/explorer.js`;

    await new Promise((resolve, reject) => {
      const script = D.createElement("script");
      script.src = src;
      script.defer = true;
      script.addEventListener("load", resolve, { once:true });
      script.addEventListener("error", reject, { once:true });
      (D.head || D.documentElement).appendChild(script);
    });

    if (!W.ZZXBlockExplorer?.explore) {
      throw new Error("explorer module unavailable");
    }
  }

  async function run(root, state) {
    if (state.busy) return;

    const query = String(q(root, "[data-bex-query]")?.value || "").trim();
    state.busy = true;
    status(root, "querying", "warn");

    try {
      const model = await W.ZZXBlockExplorer.explore(state.core, query);
      state.model = model;
      render(root, model);
    } catch (error) {
      status(root, state.model ? "error" : "offline", "error");
      q(root, "[data-bex-type]").textContent = String(error?.message || error);
      q(root, "[data-bex-meta]").textContent =
        "No result returned. The query was not opened or redirected automatically.";
    } finally {
      state.busy = false;
    }
  }

  async function boot(root, core) {
    if (!root) return;

    const state = {
      core: core || W.ZZXWidgetsCore || null,
      busy:false,
      model:null
    };

    root.__zzxBlockExplorerState = state;

    try {
      await ensureExplorer(state.core);

      q(root, "[data-bex-form]")?.addEventListener("submit", event => {
        event.preventDefault();
        run(root, state);
      });

      const input = q(root, "[data-bex-query]");
      input?.addEventListener("input", () => {
        const parsed = W.ZZXBlockExplorer.classify(input.value);

        const label =
          parsed.type === "height" ? "Detected: block height" :
          parsed.type === "hash64" ? "Detected: 64-hex txid / block hash" :
          parsed.type === "address" ? "Detected: Bitcoin mainnet address" :
          parsed.type === "empty" ? "Enter a Bitcoin block height, hash, transaction ID, or address." :
          "Unrecognized query format";

        q(root, "[data-bex-type]").textContent = label;
      });

      status(root, "ready", "ok");
    } catch (error) {
      status(root, "offline", "error");
      q(root, "[data-bex-meta]").textContent = String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID, boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID, boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID, boot);
})();
