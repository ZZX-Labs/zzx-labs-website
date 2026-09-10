(function(){
  "use strict";
  const W=window,D=document,ID="node-health";
  const q=(r,s)=>r?.querySelector?.(s)||null;
  const set=(r,s,v)=>{const e=q(r,s);if(e)e.textContent=v==null?"—":String(v)};
  const num=v=>Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString():"—";
  const pct=v=>Number.isFinite(Number(v))?`${(Number(v)*100).toFixed(2)}%`:"—";
  const resolve=p=>W.ZZXAPI?.url?W.ZZXAPI.url(p):p;
  async function ensure(){
    if(Number(W.ZZXBitnodes?.__version||0)>=8)return;
    await new Promise((ok,fail)=>{
      const s=D.createElement("script");s.src=resolve("/__partials/widgets/_shared/zzx-bitnodes.js");s.defer=true;
      s.onload=ok;s.onerror=fail;(D.head||D.documentElement).appendChild(s);
    });
    if(Number(W.ZZXBitnodes?.__version||0)<8)throw new Error("ZZXBitnodes v8 unavailable");
  }
  function status(root,label,state){
    const e=q(root,"[data-node-health-status]");if(e){e.textContent=label;e.dataset.status=state}
  }
  function render(root,detail){
    const snap=detail?.snapshot;if(!snap)return;
    const total=Number(snap.totalNodes??snap.reachableNodes??snap.nodeCount??0);
    const reachable=Number(snap.reachableNodes??snap.nodeCount??0);
    const coverage=total>0?reachable/total:NaN;
    const latest=Number(snap.latestHeight);
    let synced=0,behind=0;
    for(const node of Array.isArray(snap.nodes)?snap.nodes:[]){
      const h=Number(node?.height);
      if(!Number.isFinite(h)||!Number.isFinite(latest))continue;
      if(h>=latest-2)synced++;else behind++;
    }
    const health=snap.health||{};
    const reach24=Number(health.reachable24h)>0?Number(health.reachable24h):reachable;
    set(root,"[data-node-health-reach]",`${pct(coverage)} reachable`);
    set(root,"[data-node-health-sub]",`${num(snap.nodeCount)} decoded rows · height ${num(latest)}`);
    set(root,"[data-node-health-now]",num(Number(health.reachableNow)>0?health.reachableNow:reachable));
    set(root,"[data-node-health-24h]",num(reach24));
    set(root,"[data-node-health-sync]",`${num(synced)} / ${num(behind)}`);
    set(root,"[data-node-health-dup]",num(health.duplicateExtra||0));
    set(root,"[data-node-health-meta]",`${detail.source||snap.source||"ZZXBitnodes"} · ${detail.stale?"stale":"live"} · normalized v8`);
    status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");
  }
  async function boot(root){
    if(!root)return;root.__zzxNodeHealthState?.unsubscribe?.();
    try{
      await ensure();
      const state={unsubscribe:null};root.__zzxNodeHealthState=state;
      q(root,"[data-node-health-refresh]")?.addEventListener("click",()=>W.ZZXBitnodes.load(true).then(d=>render(root,d)));
      state.unsubscribe=W.ZZXBitnodes.subscribe(d=>{if(root.isConnected)render(root,d)},{immediate:true});
      if(!W.ZZXBitnodes.current()?.snapshot)render(root,await W.ZZXBitnodes.load(false));
    }catch(e){status(root,"offline","error");set(root,"[data-node-health-meta]",String(e?.message||e))}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
