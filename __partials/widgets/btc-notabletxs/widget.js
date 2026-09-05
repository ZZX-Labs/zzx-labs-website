// __partials/widgets/btc-notabletxs/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "btc-notabletxs";
  const PAGE_SIZE = 6;
  const SORT_KEY = "zzx.widget.btc-notabletxs.sort";

  function q(root,selector){ return root ? root.querySelector(selector) : null; }
  function finite(v){ const n=Number(v); return Number.isFinite(n)?n:NaN; }

  function shortHex(value) {
    const s=String(value || "");
    return s.length>24 ? `${s.slice(0,12)}…${s.slice(-8)}` : s;
  }

  function btcFromSats(v) {
    const n=finite(v);
    return Number.isFinite(n)
      ? `${(n/1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC`
      : "—";
  }

  function status(root,label,state) {
    const el=q(root,"[data-ntx-status]");
    if (!el) return;
    el.textContent=label;
    el.setAttribute("data-status",state || "offline");
  }

  function safeGet() {
    try { return W.localStorage.getItem(SORT_KEY); }
    catch (_) { return null; }
  }

  function safeSet(value) {
    try { W.localStorage.setItem(SORT_KEY,value); }
    catch (_) {}
  }

  async function ensureModules(core) {
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/btc-notabletxs";

    const modules=[
      ["ZZXNotableTxProvider","js/provider.js"],
      ["ZZXNotableTxModel","js/model.js"]
    ];

    for (const [globalName,relative] of modules) {
      if (W[globalName]) continue;

      const src=W.ZZXAPI?.url
        ? W.ZZXAPI.url(`${base}/${relative}`)
        : `${base}/${relative}`;

      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;
        s.defer=true;
        s.addEventListener("load",resolve,{once:true});
        s.addEventListener("error",reject,{once:true});
        (D.head||D.documentElement).appendChild(s);
      });
    }
  }

  function sortedRows(state) {
    return W.ZZXNotableTxModel.sort(
      state.model?.items || [],
      state.sort
    );
  }

  function render(root,state) {
    const rows=sortedRows(state);
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    state.page=Math.max(0,Math.min(state.page,pages-1));

    const top=rows[0];
    q(root,"[data-ntx-hero]").textContent=top ? shortHex(top.txid) : "—";
    q(root,"[data-ntx-sub]").textContent=top
      ? `${top.reason} · ${Number.isFinite(top.feerate)?top.feerate.toFixed(1)+" sat/vB":"fee rate —"} · ${btcFromSats(top.value)}`
      : "no mempool data";

    q(root,"[data-ntx-count]").textContent=String(rows.length);
    q(root,"[data-ntx-maxvalue]").textContent=btcFromSats(state.model?.maxValue);
    q(root,"[data-ntx-maxfee]").textContent=Number.isFinite(finite(state.model?.maxFee))
      ? `${Math.round(finite(state.model.maxFee)).toLocaleString()} sat`
      : "—";
    q(root,"[data-ntx-maxrate]").textContent=Number.isFinite(finite(state.model?.maxRate))
      ? `${finite(state.model.maxRate).toFixed(1)} sat/vB`
      : "—";

    const list=q(root,"[data-ntx-list]");
    list.replaceChildren();

    const slice=rows.slice(state.page*PAGE_SIZE,state.page*PAGE_SIZE+PAGE_SIZE);

    if (!slice.length) {
      const empty=D.createElement("div");
      empty.className="btc-notabletxs__empty";
      empty.textContent="No recent transaction data.";
      list.appendChild(empty);
    } else {
      for (const item of slice) {
        const row=D.createElement("article");
        row.className="btc-notabletxs__item";

        const main=D.createElement("div");
        main.className="btc-notabletxs__item-main";

        const link=D.createElement("a");
        link.href=`https://mempool.space/tx/${encodeURIComponent(item.txid)}`;
        link.target="_blank";
        link.rel="noopener noreferrer";
        link.textContent=shortHex(item.txid);
        link.title=item.txid;

        const detail=D.createElement("small");
        detail.textContent=[
          Number.isFinite(item.value) ? btcFromSats(item.value) : "value —",
          Number.isFinite(item.fee) ? `${Math.round(item.fee).toLocaleString()} sat fee` : "fee —",
          Number.isFinite(item.vsize) ? `${Math.round(item.vsize).toLocaleString()} vB` : "vsize —",
          Number.isFinite(item.vin) ? `${item.vin} in` : "",
          Number.isFinite(item.vout) ? `${item.vout} out` : ""
        ].filter(Boolean).join(" · ");

        main.append(link,detail);

        const side=D.createElement("div");
        side.className="btc-notabletxs__item-side";

        const reason=D.createElement("span");
        reason.className="btc-notabletxs__reason";
        reason.textContent=item.reason;

        const rate=D.createElement("span");
        rate.textContent=Number.isFinite(item.feerate)
          ? `${item.feerate.toFixed(1)} sat/vB`
          : "—";

        side.append(reason,rate);
        row.append(main,side);
        list.appendChild(row);
      }
    }

    q(root,"[data-ntx-page]").textContent=`page ${state.page+1} / ${pages}`;
    q(root,"[data-ntx-prev]").disabled=state.page<=0;
    q(root,"[data-ntx-next]").disabled=state.page>=pages-1;
    q(root,"[data-ntx-meta]").textContent=
      `${state.source || "configured mempool API"} · ranked by ${state.sort} · refreshed ${new Date().toLocaleTimeString()}`;

    status(root,"live","ok");
  }

  async function refresh(root,state) {
    if (state.busy || !root.isConnected) return;

    state.busy=true;
    status(root,"refreshing","warn");

    try {
      const result=await W.ZZXNotableTxProvider.load(state.core);
      state.model=W.ZZXNotableTxModel.build(result.items);
      state.source=result.source;
      state.page=0;
      render(root,state);
    } catch (error) {
      status(root,state.model?"stale":"offline",state.model?"warn":"error");
      q(root,"[data-ntx-meta]").textContent=String(error?.message || error);
    } finally {
      state.busy=false;
    }
  }

  async function boot(root,core) {
    if (!root) return;

    const state={
      core:core || W.ZZXWidgetsCore || null,
      model:null,
      sort:"score",
      page:0,
      source:"",
      busy:false,
      timer:null
    };

    root.__zzxNotableTxState=state;

    try {
      await ensureModules(state.core);

      const select=q(root,"[data-ntx-sort]");
      const saved=safeGet();
      if (saved && [...select.options].some(o=>o.value===saved)) {
        state.sort=saved;
        select.value=saved;
      }

      select.addEventListener("change",()=>{
        state.sort=select.value;
        state.page=0;
        safeSet(state.sort);
        render(root,state);
      });

      q(root,"[data-ntx-prev]")?.addEventListener("click",()=>{
        state.page=Math.max(0,state.page-1);
        render(root,state);
      });

      q(root,"[data-ntx-next]")?.addEventListener("click",()=>{
        state.page+=1;
        render(root,state);
      });

      q(root,"[data-ntx-refresh]")?.addEventListener("click",()=>refresh(root,state));

      await refresh(root,state);

      async function loop() {
        if (!root.isConnected) return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,30000);
      }

      state.timer=W.setTimeout(loop,30000);
    } catch (error) {
      status(root,"offline","error");
      q(root,"[data-ntx-meta]").textContent=String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID,boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID,boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID,boot);
})();
