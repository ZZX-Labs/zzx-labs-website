// __partials/widgets/mempool/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="mempool";

  function q(root,sel){return root?root.querySelector(sel):null}

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? Math.round(n).toLocaleString()
      : "—";
  }

  function num(v,d=2){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          minimumFractionDigits:0,
          maximumFractionDigits:d
        })
      : "—";
  }

  function btc(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? `${n.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`
      : "—";
  }

  function usd(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          style:"currency",
          currency:"USD",
          maximumFractionDigits:2
        })
      : "—";
  }

  function duration(minutes){
    const n=Number(minutes);
    if(!Number.isFinite(n))return "—";

    const total=Math.max(0,n);
    const hours=Math.floor(total/60);
    const mins=Math.round(total%60);

    return hours>0
      ? `${hours}h ${mins}m`
      : `${mins}m`;
  }

  function status(root,label,state){
    const el=q(root,"[data-mp-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/mempool";

    for(const [globalName,relative] of [
      ["ZZXMempoolProvider","js/provider.js"],
      ["ZZXMempoolModel","js/model.js"],
      ["ZZXMempoolChart","js/chart.js"]
    ]){
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

  function draw(root,state){
    if(!state.model)return;

    W.ZZXMempoolChart.draw(
      q(root,"[data-mp-canvas]"),
      state.model.histogram
    );
  }

  function render(root,state){
    const m=state.model;

    q(root,"[data-mp-vmb]").textContent=num(m.vMB,2);
    q(root,"[data-mp-tx]").textContent=int(m.count);
    q(root,"[data-mp-blocks]").textContent=num(m.blockEquivalents,2);
    q(root,"[data-mp-fees-btc]").textContent=btc(m.totalFeeBTC);
    q(root,"[data-mp-fees-usd]").textContent=usd(m.totalFeeUSD);

    q(root,"[data-mp-mean-rate]").textContent=
      Number.isFinite(m.meanFeeRate)
        ? `${num(m.meanFeeRate,2)} sat/vB`
        : "—";

    q(root,"[data-mp-median-rate]").textContent=
      Number.isFinite(m.medianFeeRate)
        ? `${num(m.medianFeeRate,2)} sat/vB`
        : "—";

    q(root,"[data-mp-avg-tx]").textContent=
      Number.isFinite(m.avgTxVbytes)
        ? `${int(m.avgTxVbytes)} vB`
        : "—";

    q(root,"[data-mp-ge10]").textContent=
      Number.isFinite(m.ge10Share)
        ? `${num(m.ge10Vbytes/1e6,2)} vMB · ${(m.ge10Share*100).toFixed(1)}%`
        : "—";

    q(root,"[data-mp-condition]").textContent=
      `${m.condition} · ${num(m.blockEquivalents,2)} block-equivalent backlog`;

    q(root,"[data-mp-clear]").textContent=
      Number.isFinite(m.clearMinutes)
        ? `${duration(m.clearMinutes)} theoretical minimum at 10 min/block, assuming full blocks and no arrivals`
        : "—";

    q(root,"[data-mp-fast-fee]").textContent=
      Number.isFinite(m.fastFee)
        ? `${num(m.fastFee,2)} sat/vB`
        : "—";

    q(root,"[data-mp-source]").textContent=m.source||"configured mempool API";

    q(root,"[data-mp-sub]").textContent=
      `${int(m.count)} transactions · ${num(m.blockEquivalents,2)} maximum-vsize block equivalents`;

    q(root,"[data-mp-meta]").textContent=
      `${m.priceSource||"ZZX BPI"} · vsize is virtual size, not physical serialized bytes`;

    draw(root,state);
    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const payload=await W.ZZXMempoolProvider.load(state.core);
      state.model=W.ZZXMempoolModel.build(payload);

      if(
        !Number.isFinite(state.model.vsize) &&
        !Number.isFinite(state.model.count)
      ){
        throw new Error("mempool payload contained no usable summary values");
      }

      render(root,state);
    }catch(error){
      status(
        root,
        state.model?"stale":"offline",
        state.model?"warn":"error"
      );

      q(root,"[data-mp-meta]").textContent=
        String(error?.message||error);
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
      timer:null,
      resize:null
    };

    root.__zzxMempoolState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-mp-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state)
      );

      if("ResizeObserver" in W){
        state.resize=new ResizeObserver(
          ()=>W.requestAnimationFrame(()=>draw(root,state))
        );
        state.resize.observe(q(root,"[data-mp-canvas]"));
      }

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,30000);
      }

      state.timer=W.setTimeout(loop,30000);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-mp-meta]").textContent=
        String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
