(function(){
  "use strict";
  const W=window,D=document,ID="clock-drift",TARGET=600;
  const q=(r,s)=>r?r.querySelector(s):null;
  const mins=s=>Number.isFinite(Number(s))?(Number(s)/60).toFixed(2)+" min":"—";
  const signed=s=>{const x=Number(s);return Number.isFinite(x)?`${x>0?"+":x<0?"−":"±"}${Math.abs(x/60).toFixed(2)} min`:"—"};
  function status(r,l,s){const e=q(r,"[data-clock-drift-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  async function ensure(core){
    if(W.ZZXClockDriftModel?.build)return;
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/clock-drift";
    const src=W.ZZXAPI?.url?W.ZZXAPI.url(`${base}/js/model.js`):`${base}/js/model.js`;
    await new Promise((res,rej)=>{const s=D.createElement("script");s.src=src;s.defer=true;s.onload=res;s.onerror=rej;(D.head||D.documentElement).appendChild(s)});
  }
  function render(root,state){
    if(!state.model)return;
    const age=Date.now()/1000-state.model.tipTs,drift=age-TARGET;
    q(root,"[data-clock-drift-value]").textContent=signed(drift);
    q(root,"[data-clock-drift-age]").textContent=mins(age);
    q(root,"[data-clock-drift-last]").textContent=`${mins(state.model.last)} · ${signed(state.model.last-TARGET)}`;
    q(root,"[data-clock-drift-mean]").textContent=`${mins(state.model.mean)} · ${signed(state.model.mean-TARGET)}`;
    q(root,"[data-clock-drift-median]").textContent=`${mins(state.model.median)} · ${signed(state.model.median-TARGET)}`;
    q(root,"[data-clock-drift-sub]").textContent=drift>0?"past nominal 10-minute target":"before nominal 10-minute target";
    q(root,"[data-clock-drift-meta]").textContent=`${state.model.count} completed intervals · tip ${Number(state.model.tip?.height||0).toLocaleString()} · header timestamps`;
  }
  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{const r=await W.ZZXChain.recentBlocks(false);state.model=W.ZZXClockDriftModel.build(r.blocks);render(root,state);status(root,"live","ok")}
    catch(e){status(root,state.model?"stale":"offline",state.model?"warn":"error");q(root,"[data-clock-drift-meta]").textContent=String(e?.message||e)}
    finally{state.busy=false}
  }
  async function boot(root,core){
    const state={model:null,busy:false,timer:null,tick:null};root.__zzxClockDriftState=state;
    try{
      await ensure(core||W.ZZXWidgetsCore||null);
      q(root,"[data-clock-drift-refresh]")?.addEventListener("click",()=>refresh(root,state));
      await refresh(root,state);
      function tick(){if(!root.isConnected)return;render(root,state);state.tick=W.setTimeout(tick,250)}tick();
      async function loop(){if(!root.isConnected)return;await refresh(root,state);state.timer=W.setTimeout(loop,15000)}state.timer=W.setTimeout(loop,15000);
    }catch(e){status(root,"offline","error");q(root,"[data-clock-drift-meta]").textContent=String(e?.message||e)}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else W.ZZXWidgetsCore?.onMount?.(ID,boot);
})();
