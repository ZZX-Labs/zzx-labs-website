(function(){
  "use strict";
  const W=window,ID="spp",CAP_SATS=21000000n*100000000n,q=(r,s)=>r?r.querySelector(s):null;
  function status(r,l,s){const e=q(r,"[data-spp-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  function fmt(v,d=0){return Number(v).toLocaleString(undefined,{maximumFractionDigits:d})}
  function render(root,state){
    if(!state.populationModel||state.height==null)return;
    const est=W.ZZXPopulation.estimateFromModel(state.populationModel,Date.now()),pop=est.population,issued=Number(state.issued);
    q(root,"[data-spp-current]").textContent=`${fmt(issued/pop,2)} sats/person`;
    q(root,"[data-spp-btc]").textContent=(issued/1e8/pop).toFixed(8)+" BTC";
    q(root,"[data-spp-cap]").textContent=`${fmt(Number(CAP_SATS)/pop,2)} sats`;
    q(root,"[data-spp-supply]").textContent=`${fmt(issued/1e8,8)} BTC`;
    q(root,"[data-spp-pop]").textContent=fmt(pop,0);
    q(root,"[data-spp-sub]").textContent=`height ${fmt(state.height,0)} · ${(state.populationModel.annualGrowth*100).toFixed(3)}%/yr population model`;
    q(root,"[data-spp-meta]").textContent=`${state.populationModel.source} · consensus subsidy schedule`;
  }
  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{
      const [tip,pop]=await Promise.all([W.ZZXChain.tipHeight(force),W.ZZXPopulation.load(force)]);
      state.height=tip.height;state.issued=W.ZZXChain.issuedSatsAtHeight(state.height);state.populationModel=pop;
      render(root,state);status(root,"live","ok");
    }catch(e){status(root,state.height!=null?"stale":"offline",state.height!=null?"warn":"error");q(root,"[data-spp-meta]").textContent=String(e?.message||e)}
    finally{state.busy=false}
  }
  async function boot(root){
    const state={height:null,issued:0n,populationModel:null,busy:false,timer:null,tick:null};root.__zzxSppState=state;
    q(root,"[data-spp-refresh]")?.addEventListener("click",()=>refresh(root,state,true));
    await refresh(root,state,false);
    function tick(){if(!root.isConnected)return;render(root,state);state.tick=W.setTimeout(tick,1000)}tick();
    async function loop(){if(!root.isConnected)return;await refresh(root,state,false);state.timer=W.setTimeout(loop,15000)}state.timer=W.setTimeout(loop,15000);
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else W.ZZXWidgetsCore?.onMount?.(ID,boot);
})();
