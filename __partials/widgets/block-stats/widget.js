(function(){
  "use strict";
  const W=window,D=document,ID="block-stats";
  const q=(r,s)=>r?r.querySelector(s):null;
  function status(r,l,s){const e=q(r,"[data-block-stats-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  async function ensure(core){
    if(W.ZZXBlockStatsModel?.build)return;
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/block-stats";
    const src=W.ZZXAPI?.url?W.ZZXAPI.url(`${base}/js/model.js`):`${base}/js/model.js`;
    await new Promise((res,rej)=>{const s=D.createElement("script");s.src=src;s.defer=true;s.onload=res;s.onerror=rej;(D.head||D.documentElement).appendChild(s)});
  }
  function fmtFees(sats,rate){
    const a=Number.isFinite(sats)?`${Math.round(sats).toLocaleString()} sat`:"—";
    const b=Number.isFinite(rate)?`${rate.toFixed(1)} sat/vB`:"—";
    return `${a} · ${b}`;
  }
  function render(root,m){
    const t=m.tip,w=Number(t.weight),tx=Number(t.tx_count);
    q(root,"[data-block-stats-height]").textContent=Number(t.height).toLocaleString();
    q(root,"[data-block-stats-time]").textContent=Number.isFinite(Number(t.timestamp))?new Date(Number(t.timestamp)*1000).toLocaleString():"—";
    q(root,"[data-block-stats-tx]").textContent=Number.isFinite(tx)?Math.round(tx).toLocaleString():"—";
    q(root,"[data-block-stats-weight]").textContent=Number.isFinite(w)?`${(w/1e6).toFixed(2)} MWU · ${(100*w/4e6).toFixed(1)}%`:"—";
    q(root,"[data-block-stats-interval]").textContent=Number.isFinite(m.mean)?`${(m.mean/60).toFixed(2)} min`:"—";
    q(root,"[data-block-stats-fees]").textContent=fmtFees(m.fees,m.avgFeeRate);
    q(root,"[data-block-stats-meta]").textContent=`block ${Number(t.height).toLocaleString()} · ${String(t.id||"").slice(0,12)}…`;
  }
  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{const r=await W.ZZXChain.recentBlocks(false);state.model=W.ZZXBlockStatsModel.build(r.blocks);render(root,state.model);status(root,"live","ok")}
    catch(e){status(root,state.model?"stale":"offline",state.model?"warn":"error");q(root,"[data-block-stats-meta]").textContent=String(e?.message||e)}
    finally{state.busy=false}
  }
  async function boot(root,core){
    const state={busy:false,model:null,timer:null};root.__zzxBlockStatsState=state;
    try{await ensure(core||W.ZZXWidgetsCore||null);q(root,"[data-block-stats-refresh]")?.addEventListener("click",()=>refresh(root,state));await refresh(root,state);
      async function loop(){if(!root.isConnected)return;await refresh(root,state);state.timer=W.setTimeout(loop,30000)}state.timer=W.setTimeout(loop,30000);
    }catch(e){status(root,"offline","error");q(root,"[data-block-stats-meta]").textContent=String(e?.message||e)}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else W.ZZXWidgetsCore?.onMount?.(ID,boot);
})();
