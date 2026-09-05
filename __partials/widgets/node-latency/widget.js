(function(){
  "use strict";
  const W=window,ID="node-latency";
  const q=(r,s)=>r?r.querySelector(s):null;
  const ms=v=>Number.isFinite(Number(v))?Number(v).toFixed(1)+" ms":"—";
  function status(r,l,s){const e=q(r,"[data-node-latency-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{
      const x=await W.ZZXBitnodesData.aggregate(false),d=x.data||{},l=d.latency_ms||{};
      q(root,"[data-node-latency-p50]").textContent=ms(l.p50);
      q(root,"[data-node-latency-avg]").textContent=ms(l.avg);
      q(root,"[data-node-latency-p90]").textContent=ms(l.p90);
      q(root,"[data-node-latency-p95]").textContent=ms(l.p95);
      q(root,"[data-node-latency-p99]").textContent=ms(l.p99);
      q(root,"[data-node-latency-sub]").textContent=`${Number(l.count||0).toLocaleString()} samples · min ${ms(l.min)} · max ${ms(l.max)}`;
      q(root,"[data-node-latency-meta]").textContent=`${x.source} · generated ${d.generated_at?new Date(d.generated_at).toLocaleString():"—"}`;
      status(root,"local","ok");
    }catch(e){status(root,"offline","error");q(root,"[data-node-latency-meta]").textContent=String(e?.message||e)}
    finally{state.busy=false}
  }
  async function boot(root){
    const state={busy:false,timer:null};root.__zzxNodeLatencyState=state;
    q(root,"[data-node-latency-refresh]")?.addEventListener("click",()=>refresh(root,state));
    await refresh(root,state);
    async function loop(){if(!root.isConnected)return;await refresh(root,state);state.timer=W.setTimeout(loop,600000)}state.timer=W.setTimeout(loop,600000);
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else W.ZZXWidgetsCore?.onMount?.(ID,boot);
})();
