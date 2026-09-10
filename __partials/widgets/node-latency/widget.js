(function(){
  "use strict";
  const W=window,D=document,ID="node-latency";
  const q=(r,s)=>r?.querySelector?.(s)||null;
  const set=(r,s,v)=>{const e=q(r,s);if(e)e.textContent=v==null?"—":String(v)};
  const ms=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(1)} ms`:"—";
  const resolve=p=>W.ZZXAPI?.url?W.ZZXAPI.url(p):p;
  async function ensure(){
    if(Number(W.ZZXBitnodes?.__version||0)>=8)return;
    await new Promise((ok,fail)=>{const s=D.createElement("script");s.src=resolve("/__partials/widgets/_shared/zzx-bitnodes.js");s.defer=true;s.onload=ok;s.onerror=fail;(D.head||D.documentElement).appendChild(s)});
    if(Number(W.ZZXBitnodes?.__version||0)<8)throw new Error("ZZXBitnodes v8 unavailable");
  }
  function status(root,label,state){const e=q(root,"[data-node-latency-status]");if(e){e.textContent=label;e.dataset.status=state}}
  function render(root,detail){
    const snap=detail?.snapshot;if(!snap)return;
    const lat=snap.latency||{};
    set(root,"[data-node-latency-p50]",ms(lat.p50));
    set(root,"[data-node-latency-avg]",ms(lat.avg));
    set(root,"[data-node-latency-p90]",ms(lat.p90));
    set(root,"[data-node-latency-p95]",ms(lat.p95));
    set(root,"[data-node-latency-p99]",ms(lat.p99));
    const count=Number(lat.count)||0;
    set(root,"[data-node-latency-sub]",count?`${count.toLocaleString()} published latency samples`:"current snapshot publishes no latency samples");
    set(root,"[data-node-latency-meta]",`${detail.source||snap.source||"ZZXBitnodes"} · ${count.toLocaleString()} samples · ${detail.stale?"stale":"live"}`);
    status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");
  }
  async function boot(root){
    if(!root)return;root.__zzxNodeLatencyState?.unsubscribe?.();
    try{
      await ensure();const state={unsubscribe:null};root.__zzxNodeLatencyState=state;
      q(root,"[data-node-latency-refresh]")?.addEventListener("click",()=>W.ZZXBitnodes.load(true).then(d=>render(root,d)));
      state.unsubscribe=W.ZZXBitnodes.subscribe(d=>{if(root.isConnected)render(root,d)},{immediate:true});
      if(!W.ZZXBitnodes.current()?.snapshot)render(root,await W.ZZXBitnodes.load(false));
    }catch(e){status(root,"offline","error");set(root,"[data-node-latency-meta]",String(e?.message||e))}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
