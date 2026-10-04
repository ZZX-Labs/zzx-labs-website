(function(){
  "use strict";
  const W=window,D=document,ID="bitage",q=(r,s)=>r?r.querySelector(s):null;
  function status(r,l,s){const e=q(r,"[data-bitage-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  async function ensure(core){
    if(W.ZZXBitAgeModel?.build)return;
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/bitage";
    const src=W.ZZXAPI?.url?W.ZZXAPI.url(`${base}/js/model.js`):`${base}/js/model.js`;
    await new Promise((res,rej)=>{const s=D.createElement("script");s.src=src;s.defer=true;s.onload=res;s.onerror=rej;(D.head||D.documentElement).appendChild(s)});
  }
  function render(root,m){
    q(root,"[data-bitage-mean]").textContent=`${(m.mean/60).toFixed(2)} min/block`;
    q(root,"[data-bitage-median]").textContent=`${(m.median/60).toFixed(2)} min`;
    q(root,"[data-bitage-std]").textContent=`${(m.std/60).toFixed(2)} min`;
    q(root,"[data-bitage-day]").textContent=m.blocksPerDay.toFixed(1);
    const delta=q(root,"[data-bitage-delta]");delta.textContent=`${m.deltaPct>=0?"+":""}${m.deltaPct.toFixed(1)}%`;delta.setAttribute("data-tone",m.deltaPct>0?"warn":"up");
    const age=Math.max(0,Date.now()/1000-Number(m.tip.timestamp));
    q(root,"[data-bitage-sub]").textContent=`${m.count} intervals · tip age ${(age/60).toFixed(1)} min`;
    q(root,"[data-bitage-meta]").textContent=`tip ${Number(m.tip.height).toLocaleString()} · header-timestamp cadence`;
  }
  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{const r=await W.ZZXChain.recentBlocks(false);state.model=W.ZZXBitAgeModel.build(r.blocks);render(root,state.model);status(root,"live","ok")}
    catch(e){status(root,state.model?"stale":"offline",state.model?"warn":"error");q(root,"[data-bitage-meta]").textContent=String(e?.message||e)}
    finally{state.busy=false}
  }
  async function boot(root,core){
    const state={busy:false,model:null,timer:null};root.__zzxBitAgeState=state;
    try{await ensure(core||W.ZZXWidgetsCore||null);q(root,"[data-bitage-refresh]")?.addEventListener("click",()=>refresh(root,state));await refresh(root,state);
      async function loop(){if(!root.isConnected)return;await refresh(root,state);state.timer=W.setTimeout(loop,30000)}state.timer=W.setTimeout(loop,30000);
    }catch(e){status(root,"offline","error")}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else W.ZZXWidgetsCore?.onMount?.(ID,boot);
})();
