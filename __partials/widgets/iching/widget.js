// __partials/widgets/iching/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "iching";

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function money(v) {
    const n = Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})
      : "—";
  }

  function btc(v) {
    const n = Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{maximumFractionDigits:8}) + " BTC"
      : "—";
  }

  function status(root, label, state) {
    const el = q(root, "[data-ich-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  async function ensureModules(core) {
    const base = core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g, "")
      : "/__partials/widgets/iching";

    const modules = [
      ["ZZXIChingStorage", "js/storage.js"],
      ["ZZXIChingModel", "js/model.js"]
    ];

    for (const [globalName, relative] of modules) {
      if (W[globalName]) continue;

      const src = W.ZZXAPI?.url
        ? W.ZZXAPI.url(`${base}/${relative}`)
        : `${base}/${relative}`;

      await new Promise((resolve, reject) => {
        const script = D.createElement("script");
        script.src = src;
        script.defer = true;
        script.addEventListener("load", resolve, { once:true });
        script.addEventListener("error", reject, { once:true });
        (D.head || D.documentElement).appendChild(script);
      });
    }
  }

  function renderLots(root, state) {
    const body = q(root, "[data-ich-lots]");
    if (!body) return;

    body.replaceChildren();

    const ordered = [...state.lots].sort((a,b) => String(b.date).localeCompare(String(a.date)));

    for (const lot of ordered) {
      const tr = D.createElement("tr");

      const values = [
        lot.date,
        money(lot.usd),
        money(lot.historicalPrice),
        btc(lot.btc)
      ];

      for (const value of values) {
        const td = D.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }

      const actions = D.createElement("td");
      const button = D.createElement("button");
      button.type = "button";
      button.className = "iching__delete";
      button.textContent = "×";
      button.title = "Delete lot";
      button.dataset.ichDelete = lot.id;
      actions.appendChild(button);
      tr.appendChild(actions);

      body.appendChild(tr);
    }
  }

  function render(root, state) {
    const model = W.ZZXIChingModel.portfolio(state.lots, state.currentPrice);

    q(root, "[data-ich-value]").textContent = money(model.value);
    q(root, "[data-ich-current]").textContent =
      Number.isFinite(state.currentPrice)
        ? `live BTC ${money(state.currentPrice)}`
        : "live BTC —";
    q(root, "[data-ich-btc]").textContent = btc(model.btc);
    q(root, "[data-ich-cost]").textContent = money(model.cost);
    q(root, "[data-ich-average]").textContent = money(model.average);

    const ret = q(root, "[data-ich-return]");
    if (ret) {
      ret.textContent = Number.isFinite(model.returnPct)
        ? `${model.returnPct >= 0 ? "+" : ""}${model.returnPct.toFixed(2)}%`
        : "—";
      ret.setAttribute("data-tone",
        Number.isFinite(model.returnPct)
          ? (model.returnPct >= 0 ? "up" : "down")
          : "flat"
      );
    }

    q(root, "[data-ich-meta]").textContent =
      state.lots.length
        ? `${state.lots.length} lot${state.lots.length === 1 ? "" : "s"} · stored locally in this browser`
        : "No lots yet · stored locally in this browser.";

    renderLots(root, state);
  }

  async function refreshPrice(root, state) {
    try {
      state.currentPrice = await W.ZZXFX.btcPriceUsd();
      render(root, state);
      status(root, "live", "ok");
    } catch (error) {
      status(root, Number.isFinite(state.currentPrice) ? "stale" : "offline",
        Number.isFinite(state.currentPrice) ? "warn" : "error");
      q(root, "[data-ich-meta]").textContent = String(error?.message || error);
    }
  }

  async function addLot(root, state) {
    const date = String(q(root, "[data-ich-date]")?.value || "");
    const usdAmount = Number(q(root, "[data-ich-usd]")?.value);

    if (!date || !(usdAmount > 0)) {
      q(root, "[data-ich-meta]").textContent = "Enter a valid historical date and USD amount.";
      return;
    }

    status(root, "resolving", "warn");
    q(root, "[data-ich-meta]").textContent = "Resolving historical BTC/USD…";

    try {
      const historical = await W.ZZXChain.historicalPriceUsd(date, false);
      const acquired = usdAmount / historical.price;

      state.lots.push({
        id: W.ZZXIChingStorage.id(),
        date,
        usd: usdAmount,
        historicalPrice: historical.price,
        btc: acquired,
        source: historical.source,
        addedAt: new Date().toISOString()
      });

      W.ZZXIChingStorage.save(state.lots);
      render(root, state);
      status(root, "live", "ok");
    } catch (error) {
      status(root, "error", "error");
      q(root, "[data-ich-meta]").textContent = `historical price error: ${error?.message || error}`;
    }
  }

  async function boot(root, core) {
    if (!root) return;

    if (!W.ZZXChain || !W.ZZXFX) {
      status(root, "offline", "error");
      q(root, "[data-ich-meta]").textContent = "ZZXChain / ZZXFX unavailable";
      return;
    }

    try {
      await ensureModules(core || W.ZZXWidgetsCore || null);

      const state = {
        lots: W.ZZXIChingStorage.load(),
        currentPrice: NaN,
        timer: null
      };

      root.__zzxIChingState = state;

      const date = q(root, "[data-ich-date]");
      const today = new Date();
      const max = today.toISOString().slice(0,10);
      date.max = max;
      date.min = "2010-07-18";

      if (!date.value) {
        const defaultDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        date.value = defaultDate.toISOString().slice(0,10);
      }

      q(root, "[data-ich-add]")?.addEventListener("click", () => addLot(root, state));
      q(root, "[data-ich-refresh]")?.addEventListener("click", () => refreshPrice(root, state));

      q(root, "[data-ich-clear]")?.addEventListener("click", () => {
        state.lots = [];
        W.ZZXIChingStorage.save(state.lots);
        render(root, state);
      });

      q(root, "[data-ich-lots]")?.addEventListener("click", event => {
        const button = event.target.closest("[data-ich-delete]");
        if (!button) return;

        state.lots = state.lots.filter(lot => lot.id !== button.dataset.ichDelete);
        W.ZZXIChingStorage.save(state.lots);
        render(root, state);
      });

      render(root, state);
      await refreshPrice(root, state);

      async function loop() {
        if (!root.isConnected) return;
        await refreshPrice(root, state);
        state.timer = W.setTimeout(loop, 30000);
      }

      state.timer = W.setTimeout(loop, 30000);
    } catch (error) {
      status(root, "offline", "error");
      q(root, "[data-ich-meta]").textContent = String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID, boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID, boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID, boot);
})();
