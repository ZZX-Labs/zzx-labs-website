// __partials/widgets/lightning/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="lightning";

  function q(root,sel){return root?root.querySelector(sel):null}

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function btc(v,d=4){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:d})
      : "—";
  }

  function status(root,label,state){
    const el=q(root,"[data-ln-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureProvider(core){
    if(W.ZZXLightningNetworkProvider?.load)return;

    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/lightning";

    const src=W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/provider.js`)
      : `${base}/js/provider.js`;

    await new Promise((resolve,reject)=>{
      const s=D.createElement("script");
      s.src=src;s.defer=true;
      s.onload=resolve;s.onerror=reject;
      (D.head||D.documentElement).appendChild(s);
    });
  }

  function render(root,m){
    q(root,"[data-ln-capacity]").textContent=btc(m.capacityBTC,2);
    q(root,"[data-ln-nodes]").textContent=int(m.nodes);
    q(root,"[data-ln-channels]").textContent=int(m.channels);

    q(root,"[data-ln-avg-channel]").textContent=
      Number.isFinite(m.avgChannelBTC)
        ? `${btc(m.avgChannelBTC,8)} BTC`
        : "—";

    q(root,"[data-ln-degree]").textContent=
      Number.isFinite(m.meanDegree)
        ? m.meanDegree.toFixed(2)
        : "—";

    q(root,"[data-ln-sub]").textContent=
      `${int(m.nodes)} nodes · ${int(m.channels)} channels · public network statistics`;

    q(root,"[data-ln-meta]").textContent=
      `${m.source} · capacity: ${m.capacityAssumption}`;

    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.model=await W.ZZXLightningNetworkProvider.load(state.core);
      render(root,state.model);
    }catch(error){
      status(root,state.model?"stale":"offline",state.model?"warn":"error");
      q(root,"[data-ln-meta]").textContent=String(error?.message||error);
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

    root.__zzxLightningState=state;

    try{
      await ensureProvider(state.core);
      q(root,"[data-ln-refresh]")?.addEventListener("click",()=>refresh(root,state));
      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,60000);
      }

      state.timer=W.setTimeout(loop,60000);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-ln-meta]").textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
