// __partials/widgets/bitavg/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "bitavg";

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function usd(v) {
    const n = Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, { style:"currency", currency:"USD", maximumFractionDigits:2 })
      : "—";
  }

  function btc(v) {
    const n = Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined, { maximumFractionDigits:0 }) + " BTC"
      : "—";
  }

  function pct(v, digits=2) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
  }

  function status(root, label, state) {
    const el = q(root, "[data-bitavg-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  async function ensureModel(core) {
    if (W.ZZXBitAvgModel?.build) return;

    const base = core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g, "")
      : "/__partials/widgets/bitavg";

    const src = W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/model.js`)
      : `${base}/js/model.js`;

    await new Promise((resolve, reject) => {
      const script = D.createElement("script");
      script.src = src;
      script.defer = true;
      script.addEventListener("load", resolve, { once:true });
      script.addEventListener("error", reject, { once:true });
      (D.head || D.documentElement).appendChild(script);
    });
  }

  async function snapshot() {
    if (W.ZZXAPI?.jsonStrict) {
      return await W.ZZXAPI.jsonStrict("/bitcoin/bpi/api/latest.json", {
        cacheBust: true,
        timeoutMs: 8000,
        retries: 1
      });
    }

    const r = await fetch("/bitcoin/bpi/api/latest.json", { cache:"no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function renderRows(root, model) {
    const body = q(root, "[data-bitavg-rows]");
    if (!body) return;

    body.replaceChildren();

    for (const row of model.rows.slice(0, 6)) {
      const tr = D.createElement("tr");

      const values = [
        row.label,
        usd(row.price),
        btc(row.volume),
        (row.weight * 100).toFixed(2) + "%",
        pct(row.deviationPct, 3)
      ];

      values.forEach((value, index) => {
        const td = D.createElement("td");
        td.textContent = value;

        if (index === 4) {
          td.setAttribute("data-tone",
            row.deviationPct > 0 ? "up" : row.deviationPct < 0 ? "down" : "flat"
          );
        }

        tr.appendChild(td);
      });

      body.appendChild(tr);
    }
  }

  async function refresh(root, state) {
    if (state.busy || !root.isConnected) return;
    state.busy = true;
    status(root, "refreshing", "warn");

    try {
      const data = await snapshot();
      const model = W.ZZXBitAvgModel.build(data);
      state.model = model;

      q(root, "[data-bitavg-price]").textContent = usd(model.bpi);
      q(root, "[data-bitavg-count]").textContent = String(model.included);
      q(root, "[data-bitavg-spread]").textContent =
        Number.isFinite(model.spread)
          ? `${usd(model.spread)} · ${model.spreadPct.toFixed(3)}%`
          : "—";
      q(root, "[data-bitavg-volume]").textContent = btc(model.volume);
      q(root, "[data-bitavg-top]").textContent =
        model.top ? `${model.top.label} ${(model.top.weight * 100).toFixed(2)}%` : "—";
      q(root, "[data-bitavg-method]").textContent =
        model.method.replaceAll("_", " ");
      q(root, "[data-bitavg-meta]").textContent =
        `${model.rows.length} weighted sources · weights ${(model.weightSum * 100).toFixed(2)}% · ${
          model.updatedAt ? new Date(model.updatedAt).toLocaleString() : "local snapshot"
        }`;

      renderRows(root, model);
      status(root, "live", "ok");
    } catch (error) {
      status(root, state.model ? "stale" : "offline", state.model ? "warn" : "error");
      q(root, "[data-bitavg-meta]").textContent = String(error?.message || error);
    } finally {
      state.busy = false;
    }
  }

  async function boot(root, core) {
    if (!root) return;

    const state = { busy:false, timer:null, model:null };
    root.__zzxBitAvgState = state;

    try {
      await ensureModel(core || W.ZZXWidgetsCore || null);
      q(root, "[data-bitavg-refresh]")?.addEventListener("click", () => refresh(root, state));
      await refresh(root, state);

      async function loop() {
        if (!root.isConnected) return;
        await refresh(root, state);
        state.timer = W.setTimeout(loop, 15000);
      }

      state.timer = W.setTimeout(loop, 15000);
    } catch (error) {
      status(root, "offline", "error");
      q(root, "[data-bitavg-meta]").textContent = String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID, boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID, boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID, boot);
})();
