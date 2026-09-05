// __partials/widgets/mining-stats/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "mining-stats";

  function q(root, selector){
    return root ? root.querySelector(selector) : null;
  }

  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }

  function num(v,d=2){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{maximumFractionDigits:d})
      : "—";
  }

  function pct(v,d=2){
    const n=finite(v);
    return Number.isFinite(n)
      ? `${n>=0?"+":""}${n.toFixed(d)}%`
      : "—";
  }

  function fractionPct(v,d=1){
    const n=finite(v);
    return Number.isFinite(n)
      ? `${(n*100).toFixed(d)}%`
      : "—";
  }

  function sci(v){
    const n=finite(v);
    if(!Number.isFinite(n))return "—";
    return n>=1e9 ? n.toExponential(3) : n.toLocaleString();
  }

  function status(root,label,state){
    const el=q(root,"[data-mining-stats-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/mining-stats";

    const modules=[
      ["ZZXMiningStatsModel","js/model.js"],
      ["ZZXMiningStatsProvider","js/provider.js"]
    ];

    for(const [globalName,relative] of modules){
      if(W[globalName])continue;

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

  function render(root,m){
    q(root,"[data-mining-stats-hashrate]").textContent =
      Number.isFinite(finite(m.hashrateEhs)) ? `${num(m.hashrateEhs,2)} EH/s` : "—";

    q(root,"[data-mining-stats-difficulty]").textContent = sci(m.difficulty);

    q(root,"[data-mining-stats-blocktime]").textContent =
      Number.isFinite(finite(m.blockTimeMin)) ? `${num(m.blockTimeMin,2)} min` : "—";

    q(root,"[data-mining-stats-blocks]").textContent =
      Number.isFinite(finite(m.blocks24h)) ? num(m.blocks24h,1) : "—";

    q(root,"[data-mining-stats-subsidy]").textContent =
      Number.isFinite(finite(m.subsidyBTC)) ? `${num(m.subsidyBTC,8)} BTC` : "—";

    q(root,"[data-mining-stats-issuance]").textContent =
      Number.isFinite(finite(m.issuance24h)) ? `${num(m.issuance24h,3)} BTC` : "—";

    q(root,"[data-mining-stats-fees]").textContent =
      Number.isFinite(finite(m.fees24h)) ? `${num(m.fees24h,4)} BTC` : "—";

    q(root,"[data-mining-stats-feeshare]").textContent = fractionPct(m.feeShare,2);

    q(root,"[data-mining-stats-adjustment]").textContent =
      `${pct(m.nextAdjustmentPct,2)} · ${
        Number.isFinite(finite(m.nextAdjustmentBlocks))
          ? Math.round(finite(m.nextAdjustmentBlocks)).toLocaleString()+" blocks"
          : "—"
      }`;

    q(root,"[data-mining-stats-eta]").textContent =
      m.nextAdjustmentEta
        ? new Date(m.nextAdjustmentEta).toLocaleString()
        : "—";

    q(root,"[data-mining-stats-source]").textContent =
      (m.sources || []).join(" + ") || "local mining-stats.json";

    q(root,"[data-mining-stats-updated]").textContent =
      m.updated ? new Date(m.updated).toLocaleString() : "—";

    q(root,"[data-mining-stats-sub]").textContent =
      `cadence-derived blocks/day · consensus subsidy schedule`;

    q(root,"[data-mining-stats-meta]").textContent =
      `local override preferred · ${m.sources?.length || 0} live fallback source${m.sources?.length===1?"":"s"}`;

    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy || !root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.model=await W.ZZXMiningStatsProvider.load(state.core);
      render(root,state.model);
    }catch(error){
      status(root,state.model?"stale":"offline",state.model?"warn":"error");
      q(root,"[data-mining-stats-meta]").textContent=String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      model:null,
      busy:false,
      timer:null
    };

    root.__zzxMiningStatsState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-mining-stats-refresh]")?.addEventListener("click",()=>{
        refresh(root,state);
      });

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,60000);
      }

      state.timer=W.setTimeout(loop,60000);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-mining-stats-meta]").textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
