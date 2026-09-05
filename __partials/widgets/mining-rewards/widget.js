// __partials/widgets/mining-rewards/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "mining-rewards";
  const TOP_N = 25;
  const PAGE_SIZE = 5;

  function q(root,selector){ return root ? root.querySelector(selector) : null; }
  function finite(v){ const n=Number(v); return Number.isFinite(n)?n:NaN; }

  function btc(v) {
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{minimumFractionDigits:4,maximumFractionDigits:8})
      : "—";
  }

  function usd(v) {
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0})
      : "—";
  }

  function status(root,label,state) {
    const el=q(root,"[data-mr-status]");
    if (!el) return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core) {
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/mining-rewards";

    const modules=[
      ["ZZXMiningRewardSources","js/sources.js"],
      ["ZZXMiningRewardsFetch","js/fetch.js"],
      ["ZZXMiningRewardsModel","js/model.js"]
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

  function renderRows(root,state) {
    const body=q(root,"[data-mr-body]");
    if (!body) return;

    body.replaceChildren();

    const rows=(state.model?.rows || []).slice(0,TOP_N);
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    state.page=Math.max(0,Math.min(state.page,pages-1));

    const start=state.page*PAGE_SIZE;
    const slice=rows.slice(start,start+PAGE_SIZE);

    if (!slice.length) {
      const empty=D.createElement("div");
      empty.className="mining-rewards__empty";
      empty.textContent="No mining pool data available.";
      body.appendChild(empty);
    } else {
      slice.forEach((row,index)=>{
        const line=D.createElement("div");
        line.className="mining-rewards__row";
        line.setAttribute("role","row");

        const values=[
          String(start+index+1),
          row.name,
          Number.isFinite(row.blocks) ? Math.round(row.blocks).toLocaleString() : "—",
          Number.isFinite(row.share) ? `${(row.share*100).toFixed(2)}%` : "—",
          btc(row.btc),
          usd(row.usd)
        ];

        values.forEach((value,i)=>{
          const cell=D.createElement("div");
          cell.setAttribute("role","cell");
          if (i>=2) cell.classList.add("mining-rewards__num");
          cell.textContent=value;

          if (i===1 && row.mode && row.mode !== "reported") {
            const badge=D.createElement("span");
            badge.className="mining-rewards__badge";
            badge.textContent="est";
            badge.title=row.mode;
            cell.appendChild(badge);
          }

          line.appendChild(cell);
        });

        body.appendChild(line);
      });
    }

    q(root,"[data-mr-page]").textContent=`page ${state.page+1} / ${pages}`;
    q(root,"[data-mr-prev]").disabled=state.page<=0;
    q(root,"[data-mr-next]").disabled=state.page>=pages-1;
  }

  function render(root,state) {
    const m=state.model;
    if (!m) return;

    q(root,"[data-mr-summary]").textContent=
      `${btc(m.totalBTC)} BTC · ${usd(m.totalUSD)}`;

    q(root,"[data-mr-sub]").textContent=
      `top ${Math.min(TOP_N,m.rows.length)} pools/miners · ${
        m.rows.some(r=>r.mode!=="reported") ? "includes explicitly marked estimates" : "reported rewards where available"
      }`;

    q(root,"[data-mr-blocks]").textContent=Math.round(m.totalBlocks).toLocaleString();
    q(root,"[data-mr-subsidy]").textContent=Number.isFinite(m.subsidyBTC)?`${m.subsidyBTC.toFixed(8)} BTC`:"—";
    q(root,"[data-mr-fees]").textContent=Number.isFinite(m.avgFeeSats)?`${Math.round(m.avgFeeSats).toLocaleString()} sat`:"—";
    q(root,"[data-mr-price]").textContent=usd(m.priceUsd);

    q(root,"[data-mr-meta]").textContent=
      `${state.poolSource || "pool source unavailable"} · ${state.priceSource || "BPI"} · refreshed ${new Date().toLocaleTimeString()}`;

    renderRows(root,state);
    status(root,"live","ok");
  }

  async function recentFeeFallback() {
    if (!W.ZZXChain?.recentBlocks) return NaN;

    try {
      const r=await W.ZZXChain.recentBlocks(false);
      const values=(r.blocks || [])
        .map(b=>finite(b?.extras?.totalFees ?? b?.total_fees))
        .filter(v=>Number.isFinite(v) && v>=0);

      return values.length
        ? values.reduce((a,b)=>a+b,0)/values.length
        : NaN;
    } catch (_) {
      return NaN;
    }
  }

  async function currentSubsidy() {
    try {
      if (W.ZZXChain?.tipHeight && W.ZZXChain?.subsidySatsAtHeight) {
        const tip=await W.ZZXChain.tipHeight(false);
        return Number(W.ZZXChain.subsidySatsAtHeight(tip.height))/1e8;
      }
    } catch (_) {}

    try {
      const tip=await W.ZZXChain?.tipHeight?.(false);
      const era=Math.floor(Number(tip.height)/210000);
      if (Number.isFinite(era) && era>=0 && era<64) {
        return Number(5000000000n >> BigInt(era))/1e8;
      }
    } catch (_) {}

    return NaN;
  }

  async function refresh(root,state) {
    if (state.busy || !root.isConnected) return;

    state.busy=true;
    status(root,"refreshing","warn");

    try {
      const sources=W.ZZXMiningRewardSources.list(state.core);

      const [poolResult,priceResult,feeResult,subsidy] = await Promise.all([
        W.ZZXMiningRewardsFetch.fetchPools(sources.pools24h),
        W.ZZXMiningRewardsFetch.fetchPrice(sources.price),
        W.ZZXMiningRewardsFetch.fetchFeeSummary(sources.blockFees),
        currentSubsidy()
      ]);

      let avgFeeSats=finite(feeResult.avgFeeSats);
      if (!Number.isFinite(avgFeeSats)) avgFeeSats=await recentFeeFallback();

      state.model=W.ZZXMiningRewardsModel.build(poolResult.rows,{
        subsidyBTC:subsidy,
        avgFeeSats,
        priceUsd:priceResult.price
      });

      state.poolSource=poolResult.source;
      state.priceSource=priceResult.source;
      state.page=Math.min(state.page,Math.max(0,Math.ceil(state.model.rows.length/PAGE_SIZE)-1));

      render(root,state);
    } catch (error) {
      status(root,state.model?"stale":"offline",state.model?"warn":"error");
      q(root,"[data-mr-meta]").textContent=String(error?.message || error);
    } finally {
      state.busy=false;
    }
  }

  async function boot(root,core) {
    if (!root) return;

    const state={
      core:core || W.ZZXWidgetsCore || null,
      model:null,
      page:0,
      busy:false,
      poolSource:"",
      priceSource:"",
      timer:null
    };

    root.__zzxMiningRewardsState=state;

    try {
      await ensureModules(state.core);

      q(root,"[data-mr-prev]")?.addEventListener("click",()=>{
        state.page=Math.max(0,state.page-1);
        renderRows(root,state);
      });

      q(root,"[data-mr-next]")?.addEventListener("click",()=>{
        state.page+=1;
        renderRows(root,state);
      });

      q(root,"[data-mr-refresh]")?.addEventListener("click",()=>refresh(root,state));

      await refresh(root,state);

      async function loop() {
        if (!root.isConnected) return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,60000);
      }

      state.timer=W.setTimeout(loop,60000);
    } catch (error) {
      status(root,"offline","error");
      q(root,"[data-mr-meta]").textContent=String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID,boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID,boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID,boot);
})();
