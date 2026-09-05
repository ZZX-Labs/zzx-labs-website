// __partials/widgets/difficulty-adjustment/widget.js
(function () {
  "use strict";

  const W = window, D = document, ID = "difficulty-adjustment";

  function q(r,s){ return r ? r.querySelector(s) : null; }
  function n(v){ const x=Number(v); return Number.isFinite(x)?x:NaN; }
  function pct(v){ const x=n(v); return Number.isFinite(x)?`${x>=0?"+":""}${x.toFixed(2)}%`:"—"; }
  function dur(ms){
    const x=n(ms);
    if(!Number.isFinite(x) || x<0) return "—";
    const total=Math.round(x/1000);
    const d=Math.floor(total/86400), h=Math.floor((total%86400)/3600), m=Math.floor((total%3600)/60);
    return d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m`;
  }
  function status(root,label,state){
    const el=q(root,"[data-da-status]"); if(!el)return;
    el.textContent=label; el.setAttribute("data-status",state||"offline");
  }
  async function ensure(core){
    if(W.ZZXDifficultyProvider?.load)return;
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/difficulty-adjustment";
    const src=W.ZZXAPI?.url?W.ZZXAPI.url(`${base}/js/provider.js`):`${base}/js/provider.js`;
    await new Promise((resolve,reject)=>{
      const s=D.createElement("script"); s.src=src; s.defer=true;
      s.addEventListener("load",resolve,{once:true}); s.addEventListener("error",reject,{once:true});
      (D.head||D.documentElement).appendChild(s);
    });
  }
  function render(root,data,base){
    const change=n(data?.difficultyChange ?? data?.difficultyChangePercent ?? data?.estimatedDifficultyAdjustment);
    const progress=n(data?.progressPercent ?? data?.progress);
    const remaining=n(data?.remainingBlocks ?? data?.blocksRemaining);
    const time=n(data?.remainingTime ?? data?.remainingTimeMs);
    const retarget=n(data?.estimatedRetargetDate ?? data?.estimatedRetargetTimestamp);
    const previous=n(data?.previousRetarget ?? data?.previousDifficultyChange);

    q(root,"[data-da-change]").textContent=pct(change);

    const safeProgress=Number.isFinite(progress)?Math.max(0,Math.min(100,progress)):NaN;
    q(root,"[data-da-progress-label]").textContent=Number.isFinite(safeProgress)?`epoch progress ${safeProgress.toFixed(2)}%`:"epoch progress —";
    q(root,"[data-da-blocks]").textContent=Number.isFinite(remaining)?`${Math.round(2016-remaining).toLocaleString()} / 2,016 blocks`:"—";

    const track=q(root,"[data-da-progress]");
    if(track && Number.isFinite(safeProgress)) track.setAttribute("aria-valuenow",String(safeProgress.toFixed(2)));
    const bar=q(root,"[data-da-bar]");
    if(bar) bar.style.width=Number.isFinite(safeProgress)?`${safeProgress}%`:"0%";

    q(root,"[data-da-remaining]").textContent=Number.isFinite(remaining)?`${Math.round(remaining).toLocaleString()} blocks`:"—";
    q(root,"[data-da-time]").textContent=dur(time);
    q(root,"[data-da-retarget]").textContent=Number.isFinite(retarget)?new Date(retarget<2e12?retarget*1000:retarget).toLocaleString():"—";
    q(root,"[data-da-previous]").textContent=Number.isFinite(previous)?pct(previous):"—";
    q(root,"[data-da-meta]").textContent=`${String(base).replace(/^https?:\/\//,"")} · refreshed ${new Date().toLocaleTimeString()}`;
    status(root,"live","ok");
  }
  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;
    state.busy=true; status(root,"refreshing","warn");
    try{
      const result=await W.ZZXDifficultyProvider.load(state.core);
      render(root,result.data,result.base);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-da-meta]").textContent=String(error?.message||error);
    }finally{ state.busy=false; }
  }
  async function boot(root,core){
    const state={core:core||W.ZZXWidgetsCore||null,busy:false,timer:null};
    root.__zzxDifficultyState=state;
    try{
      await ensure(state.core);
      q(root,"[data-da-refresh]")?.addEventListener("click",()=>refresh(root,state));
      await refresh(root,state);
      async function loop(){ if(!root.isConnected)return; await refresh(root,state); state.timer=W.setTimeout(loop,60000); }
      state.timer=W.setTimeout(loop,60000);
    }catch(error){ status(root,"offline","error"); q(root,"[data-da-meta]").textContent=String(error?.message||error); }
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
})();
