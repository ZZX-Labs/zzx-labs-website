// __partials/widgets/btc-burned/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "btc-burned";
  const PAGE_SIZE = 6;

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function formatBTC(value) {
    const n = Number(value);
    return Number.isFinite(n)
      ? `${n.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`
      : "—";
  }

  function status(root, label, state) {
    const el = q(root, "[data-burn-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  async function ensureModel(core) {
    if (W.ZZXBurnedModel?.normalize) return;

    const base = core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g, "")
      : "/__partials/widgets/btc-burned";

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

    if (!W.ZZXBurnedModel?.normalize) {
      throw new Error("burn model unavailable");
    }
  }

  function dataURL(core) {
    const path = "/__partials/widgets/btc-burned/btc-burned.json";

    if (core?.ctx?.urlFor) return core.ctx.urlFor(path);
    if (core?.url) return core.url(path);
    if (W.ZZXAPI?.url) return W.ZZXAPI.url(path);
    return path;
  }

  async function fetchDataset(core) {
    const url = dataURL(core);

    if (core?.ctx?.fetchJSON) {
      return await core.ctx.fetchJSON(url);
    }

    if (W.ZZXAPI?.jsonStrict) {
      return await W.ZZXAPI.jsonStrict(url, {
        cacheBust:true,
        timeoutMs:8000,
        retries:1
      });
    }

    const response = await fetch(url, { cache:"no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  function makeItem(item) {
    const row = D.createElement("article");
    row.className = "btc-burned__item";

    const main = D.createElement("div");
    main.className = "btc-burned__item-main";

    const title = D.createElement("div");
    title.className = "btc-burned__item-title";

    const label = D.createElement("strong");
    label.textContent = item.label;

    const badge = D.createElement("span");
    badge.className = "btc-burned__badge";
    badge.setAttribute("data-status", item.status);
    badge.textContent = item.status;

    title.append(label, badge);

    const sub = D.createElement("div");
    sub.className = "btc-burned__item-sub";
    sub.textContent = [
      item.category || "other",
      item.when || "date unknown",
      item.evidence || item.notes || ""
    ].filter(Boolean).join(" · ");

    main.append(title, sub);

    const value = D.createElement("div");
    value.className = "btc-burned__item-value";

    const amount = D.createElement("span");
    amount.textContent = formatBTC(item.btc);
    value.appendChild(amount);

    if (item.source) {
      const link = D.createElement("a");
      link.href = item.source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "evidence";
      value.appendChild(link);
    }

    row.append(main, value);
    return row;
  }

  function render(root, state) {
    const model = state.model;
    if (!model) return;

    q(root, "[data-burn-total]").textContent = formatBTC(model.verifiedTotal);
    q(root, "[data-burn-verified]").textContent = String(model.verified.length);
    q(root, "[data-burn-claimed]").textContent =
      `${model.claims.length} · ${formatBTC(model.claimedTotal)}`;
    q(root, "[data-burn-count]").textContent = String(model.items.length);
    q(root, "[data-burn-updated]").textContent =
      model.updated ? new Date(model.updated).toLocaleDateString() : "—";

    const mode = q(root, "[data-burn-filter]")?.value || "verified";
    const search = q(root, "[data-burn-search]")?.value || "";
    const rows = W.ZZXBurnedModel.filter(model, mode, search);

    const maxPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    state.page = Math.min(state.page, maxPage);

    const start = state.page * PAGE_SIZE;
    const slice = rows.slice(start, start + PAGE_SIZE);

    const list = q(root, "[data-burn-list]");
    list.replaceChildren();

    if (!slice.length) {
      const empty = D.createElement("div");
      empty.className = "btc-burned__empty";
      empty.textContent =
        mode === "verified"
          ? "No verified burn records are present in the local dataset."
          : "No records match this filter.";
      list.appendChild(empty);
    } else {
      for (const item of slice) list.appendChild(makeItem(item));
    }

    q(root, "[data-burn-page]").textContent =
      `page ${state.page + 1}/${maxPage + 1} · ${rows.length} shown`;

    const prev = q(root, "[data-burn-prev]");
    const next = q(root, "[data-burn-next]");
    if (prev) prev.disabled = state.page <= 0;
    if (next) next.disabled = state.page >= maxPage;

    q(root, "[data-burn-meta]").textContent =
      `${model.schema} · ${model.methodology || "local evidence dataset"}`;

    status(root, "local", "ok");
  }

  async function load(root, state) {
    status(root, "loading", "warn");

    try {
      const raw = await fetchDataset(state.core);
      state.model = W.ZZXBurnedModel.normalize(raw);
      state.page = 0;
      render(root, state);
    } catch (error) {
      status(root, state.model ? "stale" : "offline", state.model ? "warn" : "error");
      q(root, "[data-burn-meta]").textContent = String(error?.message || error);
    }
  }

  async function boot(root, core) {
    if (!root) return;

    const state = {
      core: core || W.ZZXWidgetsCore || null,
      model:null,
      page:0
    };

    root.__zzxBurnedState = state;

    try {
      await ensureModel(state.core);

      q(root, "[data-burn-filter]")?.addEventListener("change", () => {
        state.page = 0;
        render(root, state);
      });

      let searchTimer = null;
      q(root, "[data-burn-search]")?.addEventListener("input", () => {
        if (searchTimer) W.clearTimeout(searchTimer);
        searchTimer = W.setTimeout(() => {
          state.page = 0;
          render(root, state);
        }, 120);
      });

      q(root, "[data-burn-prev]")?.addEventListener("click", () => {
        state.page = Math.max(0, state.page - 1);
        render(root, state);
      });

      q(root, "[data-burn-next]")?.addEventListener("click", () => {
        state.page += 1;
        render(root, state);
      });

      q(root, "[data-burn-refresh]")?.addEventListener("click", () => load(root, state));

      await load(root, state);
    } catch (error) {
      status(root, "offline", "error");
      q(root, "[data-burn-meta]").textContent = String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID, boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID, boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID, boot);
})();
