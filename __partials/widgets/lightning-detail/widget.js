// __partials/widgets/lightning-detail/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="lightning-detail";

  function q(root,sel){return root?root.querySelector(sel):null}

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function btc(v,d=8){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:d})
      : "—";
  }

  function status(root,label,state){
    const el=q(root,"[data-lnd-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureProvider(core){
    if(W.ZZXLightningNetworkProvider?.load)return;

    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/lightning-detail";

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
    q(root,"[data-lnd-capacity]").textContent=
      Number.isFinite(m.capacityBTC)
        ? `${btc(m.capacityBTC,4)} BTC`
        : "—";

    q(root,"[data-lnd-capacity-sats]").textContent=
      Number.isFinite(m.capacitySats)
        ? `${Math.round(m.capacitySats).toLocaleString()} sat public capacity`
        : "capacity unavailable";

    q(root,"[data-lnd-nodes]").textContent=int(m.nodes);
    q(root,"[data-lnd-channels]").textContent=int(m.channels);

    q(root,"[data-lnd-cpn]").textContent=
      Number.isFinite(m.channelsPerNode)
        ? m.channelsPerNode.toFixed(2)
        : "—";

    q(root,"[data-lnd-degree]").textContent=
      Number.isFinite(m.meanDegree)
        ? m.meanDegree.toFixed(2)
        : "—";

    q(root,"[data-lnd-per-channel]").textContent=
      Number.isFinite(m.avgChannelBTC)
        ? `${btc(m.avgChannelBTC,8)} BTC`
        : "—";

    q(root,"[data-lnd-per-channel-sats]").textContent=
      Number.isFinite(m.avgChannelBTC)
        ? `${Math.round(m.avgChannelBTC*1e8).toLocaleString()} sat`
        : "—";

    q(root,"[data-lnd-per-node]").textContent=
      Number.isFinite(m.avgNodeBTC)
        ? `${btc(m.avgNodeBTC,8)} BTC`
        : "—";

    q(root,"[data-lnd-endpoints]").textContent=
      Number.isFinite(m.channels)
        ? int(m.channels*2)
        : "—";

    q(root,"[data-lnd-cap-field]").textContent=m.capacityField||"unknown";
    q(root,"[data-lnd-cap-assumption]").textContent=m.capacityAssumption||"unknown";

    q(root,"[data-lnd-updated]").textContent=
      Number.isFinite(m.updatedMs)
        ? new Date(m.updatedMs).toLocaleString()
        : `fetched ${new Date(m.fetchedAt).toLocaleString()}`;

    q(root,"[data-lnd-source]").textContent=m.source||"configured mempool API";

    q(root,"[data-lnd-meta]").textContent=
      "public-channel graph only · derived liquidity/topology values are arithmetic summaries, not private-network measurements";

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
      q(root,"[data-lnd-meta]").textContent=String(error?.message||error);
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

    root.__zzxLightningDetailState=state;

    try{
      await ensureProvider(state.core);
      q(root,"[data-lnd-refresh]")?.addEventListener("click",()=>refresh(root,state));
      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,60000);
      }

      state.timer=W.setTimeout(loop,60000);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-lnd-meta]").textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
