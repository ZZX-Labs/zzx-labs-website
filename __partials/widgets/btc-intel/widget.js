// __partials/widgets/btc-intel/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "btc-intel";
  const FILTER_KEY = "zzx.widget.btc-intel.filter";

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function safeGet(key) {
    try { return W.localStorage.getItem(key); }
    catch (_) { return null; }
  }

  function safeSet(key,value) {
    try { W.localStorage.setItem(key,value); }
    catch (_) {}
  }

  function status(root,label,state) {
    const el = q(root,"[data-btc-intel-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status",state || "offline");
  }

  function money(value,digits=2) {
    const n = finite(value);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          style:"currency",
          currency:"USD",
          maximumFractionDigits:digits
        })
      : "—";
  }

  function ago(timestamp) {
    const ts = finite(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) return "—";

    const seconds = Math.max(0,Math.floor((Date.now()-ts)/1000));
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds/60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes/60);
    if (hours < 24) return `${hours}h ago`;

    return `${Math.floor(hours/24)}d ago`;
  }

  async function ensureSources(core) {
    if (W.ZZXBTCIntelSources?.feed) return;

    const base = core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/btc-intel";

    const src = W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/sources.js`)
      : `${base}/js/sources.js`;

    await new Promise((resolve,reject)=>{
      const script = D.createElement("script");
      script.src = src;
      script.defer = true;
      script.addEventListener("load",resolve,{once:true});
      script.addEventListener("error",reject,{once:true});
      (D.head || D.documentElement).appendChild(script);
    });

    if (!W.ZZXBTCIntelSources?.feed) {
      throw new Error("BTC Intel source module unavailable");
    }
  }

  function filteredItems(state) {
    const filter = state.filter || "all";
    const rows = state.items || [];

    if (filter === "all") return rows;
    return rows.filter(item => item.category === filter);
  }

  function renderList(root,state) {
    const host = q(root,"[data-btc-intel-list]");
    if (!host) return;

    host.replaceChildren();

    let rows = filteredItems(state);

    if (state.rotationSource && state.filter === "all") {
      const sourceRows = rows.filter(item => item.source === state.rotationSource);
      if (sourceRows.length) rows = sourceRows;
    }

    rows = rows.slice(0,8);

    if (!rows.length) {
      const empty = D.createElement("div");
      empty.className = "btc-intel__empty";
      empty.textContent = "No items available for this source/filter.";
      host.appendChild(empty);
      return;
    }

    for (const item of rows) {
      const row = D.createElement("article");
      row.className = "btc-intel__item";

      const tag = D.createElement("span");
      tag.className = "btc-intel__tag";
      tag.textContent = item.source;

      const main = D.createElement("div");
      main.className = "btc-intel__item-main";

      const link = D.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.title;

      const detail = D.createElement("small");
      detail.textContent = `${item.category} · ${item.detail || "source item"}`;

      main.append(link,detail);

      const time = D.createElement("time");
      time.dateTime = item.ts ? new Date(item.ts).toISOString() : "";
      time.textContent = ago(item.ts);

      row.append(tag,main,time);
      host.appendChild(row);
    }
  }

  function renderMarket(root,state) {
    const data = state.market?.data || {};
    const price = finite(
      data.price_usd ??
      data.bpi_usd ??
      data.vwap_usd
    );

    const high = finite(data.high_24h);
    const low = finite(data.low_24h);
    const block = finite(data.block_height);

    q(root,"[data-btc-intel-hero]").textContent =
      Number.isFinite(block)
        ? `Block ${Math.trunc(block).toLocaleString()}`
        : "Bitcoin network";

    q(root,"[data-btc-intel-sub]").textContent =
      `${state.market?.source || "ZZX BPI"} · ${Number.isFinite(price) ? money(price) + " / BTC" : "price unavailable"}`;

    q(root,"[data-btc-intel-price]").textContent = money(price);

    q(root,"[data-btc-intel-range]").textContent =
      Number.isFinite(high) && Number.isFinite(low)
        ? `${money(low,0)} – ${money(high,0)}`
        : "—";

    q(root,"[data-btc-intel-count]").textContent =
      String((state.items || []).length);

    q(root,"[data-btc-intel-sources]").textContent =
      `${state.liveSources.length}/${state.sourceCount}`;

    q(root,"[data-btc-intel-meta]").textContent =
      `${state.liveSources.join(" · ") || "no external source live"}${
        state.failedSources.length
          ? ` · failed: ${state.failedSources.join(", ")}`
          : ""
      }`;
  }

  function renderSourceLine(root,state) {
    const active = q(root,"[data-btc-intel-active-source]");
    const age = q(root,"[data-btc-intel-age]");

    if (active) {
      active.textContent =
        state.filter !== "all"
          ? `filter: ${state.filter}`
          : state.rotationSource
            ? `source: ${state.rotationSource}`
            : "all sources";
    }

    if (age) {
      age.textContent =
        state.updatedAt
          ? `updated ${ago(state.updatedAt)}`
          : "—";
    }
  }

  function render(root,state) {
    renderMarket(root,state);
    renderSourceLine(root,state);
    renderList(root,state);
  }

  function rotate(root,state) {
    if (state.filter !== "all") {
      state.rotationSource = null;
      render(root,state);
      return;
    }

    const sources = [...new Set(
      (state.items || []).map(item => item.source).filter(Boolean)
    )];

    if (!sources.length) {
      state.rotationSource = null;
      render(root,state);
      return;
    }

    state.rotationIndex = (state.rotationIndex + 1) % (sources.length + 1);

    state.rotationSource =
      state.rotationIndex === sources.length
        ? null
        : sources[state.rotationIndex];

    render(root,state);
  }

  async function refresh(root,state,force=false) {
    if (state.busy || !root.isConnected) return;

    state.busy = true;
    status(root,"refreshing","warn");

    try {
      const [marketResult,feedResult] = await Promise.allSettled([
        W.ZZXBTCIntelSources.market(force),
        W.ZZXBTCIntelSources.feed(force)
      ]);

      if (marketResult.status === "fulfilled") {
        state.market = marketResult.value;
      }

      if (feedResult.status === "fulfilled") {
        state.items = feedResult.value.items;
        state.liveSources = feedResult.value.liveSources;
        state.failedSources = feedResult.value.failedSources;
      }

      state.updatedAt = Date.now();

      if (
        marketResult.status === "rejected" &&
        feedResult.status === "rejected" &&
        !state.items.length &&
        !state.market
      ) {
        throw new Error("all BTC Intel sources unavailable");
      }

      render(root,state);

      status(
        root,
        state.failedSources.length ? "partial" : "live",
        state.failedSources.length ? "warn" : "ok"
      );
    } catch (error) {
      status(root,state.items.length || state.market ? "stale" : "offline",
        state.items.length || state.market ? "warn" : "error");
      q(root,"[data-btc-intel-meta]").textContent =
        String(error?.message || error);
    } finally {
      state.busy = false;
    }
  }

  async function boot(root,core) {
    if (!root) return;

    const state = {
      busy:false,
      market:null,
      items:[],
      liveSources:[],
      failedSources:[],
      sourceCount:5,
      filter:"all",
      rotationIndex:-1,
      rotationSource:null,
      updatedAt:0,
      refreshTimer:null,
      rotateTimer:null,
      ageTimer:null
    };

    root.__zzxBTCIntelState = state;

    try {
      await ensureSources(core || W.ZZXWidgetsCore || null);

      const filter = q(root,"[data-btc-intel-filter]");
      const saved = safeGet(FILTER_KEY);

      if (
        saved &&
        [...filter.options].some(option => option.value === saved)
      ) {
        filter.value = saved;
        state.filter = saved;
      }

      filter?.addEventListener("change",()=>{
        state.filter = filter.value;
        state.rotationSource = null;
        safeSet(FILTER_KEY,state.filter);
        render(root,state);
      });

      q(root,"[data-btc-intel-rotate]")?.addEventListener("click",()=>{
        rotate(root,state);
      });

      q(root,"[data-btc-intel-refresh]")?.addEventListener("click",()=>{
        refresh(root,state,true);
      });

      await refresh(root,state,false);

      async function refreshLoop() {
        if (!root.isConnected) return;
        await refresh(root,state,false);
        state.refreshTimer = W.setTimeout(refreshLoop,60000);
      }

      function rotateLoop() {
        if (!root.isConnected) return;
        rotate(root,state);
        state.rotateTimer = W.setTimeout(rotateLoop,30000);
      }

      function ageLoop() {
        if (!root.isConnected) return;
        renderSourceLine(root,state);
        state.ageTimer = W.setTimeout(ageLoop,10000);
      }

      state.refreshTimer = W.setTimeout(refreshLoop,60000);
      state.rotateTimer = W.setTimeout(rotateLoop,30000);
      state.ageTimer = W.setTimeout(ageLoop,10000);
    } catch (error) {
      status(root,"offline","error");
      q(root,"[data-btc-intel-meta]").textContent =
        String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID,boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID,boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID,boot);
})();
