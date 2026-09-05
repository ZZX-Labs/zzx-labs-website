(function(){
  "use strict";
  const W=window,ID="node-health";
  const q=(r,s)=>r?r.querySelector(s):null;
  const i=v=>Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString():"—";
  const p=(v,t)=>Number.isFinite(Number(v))&&Number(t)>0?(100*Number(v)/Number(t)).toFixed(2)+"%":"—";
  function status(r,l,s){const e=q(r,"[data-node-health-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{
      const x=await W.ZZXBitnodesData.aggregate(false),d=x.data||{},c=d.counts||{},t=Number(c.total??d.total_nodes),reach=Number(c.reachable??d.reachable_nodes);
      q(root,"[data-node-health-reach]").textContent=`${i(reach)} · ${p(reach,t)}`;
      q(root,"[data-node-health-now]").textContent=`${i(c.reachable_now??d.reachable_now)} · ${p(c.reachable_now??d.reachable_now,t)}`;
      q(root,"[data-node-health-24h]").textContent=`${i(c.reachable_24h??d.reachable_24h)} · ${p(c.reachable_24h??d.reachable_24h,t)}`;
      q(root,"[data-node-health-sync]").textContent=`${i(c.synced)} / ${i(c.not_synced)}`;
      q(root,"[data-node-health-dup]").textContent=i(c.duplicates);
      const knownSync=Number(c.synced||0)+Number(c.not_synced||0);
      q(root,"[data-node-health-sub]").textContent=`sync coverage ${p(c.synced,knownSync)} · median latency ${Number(d.latency_ms?.p50||0).toFixed(1)} ms`;
      q(root,"[data-node-health-meta]").textContent=`${x.source} · height p50 ${i(d.height?.summary?.p50)}`;
      status(root,"local","ok");
    }catch(e){status(root,"offline","error");q(root,"[data-node-health-meta]").textContent=String(e?.message||e)}
    finally{state.busy=false}
  }
  async function boot(root){
    const state={busy:false,timer:null};root.__zzxNodeHealthState=state;
    q(root,"[data-node-health-refresh]")?.addEventListener("click",()=>refresh(root,state));
    await refresh(root,state);
    async function loop(){if(!root.isConnected)return;await refresh(root,state);state.timer=W.setTimeout(loop,600000)}state.timer=W.setTimeout(loop,600000);
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else W.ZZXWidgetsCore?.onMount?.(ID,boot);
})();
