// __partials/widgets/btc-lost/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "btc-lost";
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

  function formatRange(min, max) {
    const a = Number(min), b = Number(max);
    if (!Number.isFinite(a) && !Number.isFinite(b)) return "—";
    if (Number.isFinite(a) && Number.isFinite(b) && a === b) return formatBTC(a);
    return `${Number.isFinite(a)?formatBTC(a):"—"} – ${Number.isFinite(b)?formatBTC(b):"—"}`;
  }

  function status(root, label, state) {
    const el = q(root, "[data-loss-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  async function ensureModel(core) {
    if (W.ZZXLossEvidenceModel?.normalize) return;

    const base = core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g, "")
      : `/__partials/widgets/${ID}`;

    const src = W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/model.js`)
      : `${base}/js/model.js`;

    await new Promise((resolve, reject) => {
      const s = D.createElement("script");
      s.src = src;
      s.defer = true;
      s.addEventListener("load", resolve, { once:true });
      s.addEventListener("error", reject, { once:true });
      (D.head || D.documentElement).appendChild(s);
    });

    if (!W.ZZXLossEvidenceModel?.normalize) {
      throw new Error("evidence model unavailable");
    }
  }

  function dataURL(core) {
    const path = `/__partials/widgets/${ID}/${ID}.json`;
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

    const r = await fetch(url,{cache:"no-store"});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function makeItem(item) {
    const row = D.createElement("article");
    row.className = `${ID}__item`;

    const main = D.createElement("div");
    main.className = `${ID}__item-main`;

    const title = D.createElement("div");
    title.className = `${ID}__item-title`;

    const label = D.createElement("strong");
    label.textContent = item.label;

    const badge = D.createElement("span");
    badge.className = `${ID}__badge`;
    badge.setAttribute("data-status", item.status);
    badge.textContent = item.status;

    title.append(label, badge);

    const sub = D.createElement("div");
    sub.className = `${ID}__item-sub`;
    sub.textContent = [
      item.category || "other",
      item.when || "date unknown",
      item.evidence || item.notes || ""
    ].filter(Boolean).join(" · ");

    main.append(title, sub);

    const value = D.createElement("div");
    value.className = `${ID}__item-value`;

    const amount = D.createElement("span");
    amount.textContent =
      Number.isFinite(item.btc)
        ? formatBTC(item.btc)
        : (
            Number.isFinite(item.btcMin) || Number.isFinite(item.btcMax)
              ? formatRange(item.btcMin,item.btcMax)
              : "amount unknown"
          );

    value.appendChild(amount);

    if (item.source) {
      const link = D.createElement("a");
      link.href = item.source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "evidence";
      value.appendChild(link);
    }

    row.append(main,value);
    return row;
  }

  function render(root,state) {
    const model = state.model;
    if (!model) return;

    q(root,"[data-loss-total]").textContent = formatBTC(model.verifiedTotal);
    q(root,"[data-loss-verified]").textContent = String(model.verified.length);
    q(root,"[data-loss-nonverified]").textContent = String(model.nonverified.length);
    q(root,"[data-loss-range]").textContent = formatRange(model.estimatedMin,model.estimatedMax);
    q(root,"[data-loss-updated]").textContent =
      model.updated ? new Date(model.updated).toLocaleDateString() : "—";

    const mode = q(root,"[data-loss-filter]")?.value || "verified";
    const search = q(root,"[data-loss-search]")?.value || "";
    const rows = W.ZZXLossEvidenceModel.filter(model,mode,search);

    const maxPage = Math.max(0,Math.ceil(rows.length/PAGE_SIZE)-1);
    state.page = Math.min(state.page,maxPage);

    const start = state.page*PAGE_SIZE;
    const slice = rows.slice(start,start+PAGE_SIZE);

    const list = q(root,"[data-loss-list]");
    list.replaceChildren();

    if (!slice.length) {
      const empty = D.createElement("div");
      empty.className = `${ID}__empty`;
      empty.textContent =
        mode === "verified"
          ? "No verified records are present in the local dataset."
          : "No records match this filter.";
      list.appendChild(empty);
    } else {
      for (const item of slice) list.appendChild(makeItem(item));
    }

    q(root,"[data-loss-page]").textContent =
      `page ${state.page+1}/${maxPage+1} · ${rows.length} records`;

    q(root,"[data-loss-prev]").disabled = state.page <= 0;
    q(root,"[data-loss-next]").disabled = state.page >= maxPage;

    q(root,"[data-loss-meta]").textContent =
      `${model.schema} · ${model.methodology || "local evidence dataset"}`;

    status(root,"local","ok");
  }

  async function load(root,state) {
    status(root,"loading","warn");

    try {
      const raw = await fetchDataset(state.core);
      state.model = W.ZZXLossEvidenceModel.normalize(raw);
      state.page = 0;
      render(root,state);
    } catch (error) {
      status(root,state.model?"stale":"offline",state.model?"warn":"error");
      q(root,"[data-loss-meta]").textContent = String(error?.message || error);
    }
  }

  async function boot(root,core) {
    if (!root) return;

    const state = {
      core:core || W.ZZXWidgetsCore || null,
      model:null,
      page:0
    };

    root[`__zzx_${ID.replaceAll("-","_")}`] = state;

    try {
      await ensureModel(state.core);

      q(root,"[data-loss-filter]")?.addEventListener("change",()=>{
        state.page=0;
        render(root,state);
      });

      let searchTimer=null;
      q(root,"[data-loss-search]")?.addEventListener("input",()=>{
        if(searchTimer)W.clearTimeout(searchTimer);
        searchTimer=W.setTimeout(()=>{
          state.page=0;
          render(root,state);
        },120);
      });

      q(root,"[data-loss-prev]")?.addEventListener("click",()=>{
        state.page=Math.max(0,state.page-1);
        render(root,state);
      });

      q(root,"[data-loss-next]")?.addEventListener("click",()=>{
        state.page+=1;
        render(root,state);
      });

      q(root,"[data-loss-refresh]")?.addEventListener("click",()=>load(root,state));

      await load(root,state);
    } catch (error) {
      status(root,"offline","error");
      q(root,"[data-loss-meta]").textContent = String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID,boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID,boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID,boot);
})();
