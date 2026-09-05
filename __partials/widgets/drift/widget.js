// __partials/widgets/drift/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="drift";

  function q(root,sel){return root?root.querySelector(sel):null}

  function minutes(sec){
    const n=Number(sec);
    return Number.isFinite(n)?`${(n/60).toFixed(2)} min`:"—";
  }

  function signed(sec){
    const n=Number(sec);
    if(!Number.isFinite(n))return "—";
    const m=n/60;
    return `${m>0?"+":m<0?"−":"±"}${Math.abs(m).toFixed(2)} min`;
  }

  function duration(sec){
    const n=Math.abs(Number(sec));
    if(!Number.isFinite(n))return "—";
    const h=Math.floor(n/3600);
    const m=Math.floor((n%3600)/60);
    const s=Math.round(n%60);
    return h?`${h}h ${m}m`:m?`${m}m ${s}s`:`${s}s`;
  }

  function status(root,label,state){
    const el=q(root,"[data-drift-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModel(core){
    if(W.ZZXDriftModel?.build)return;

    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/drift";

    const src=W.ZZXAPI?.url?W.ZZXAPI.url(`${base}/js/model.js`):`${base}/js/model.js`;

    await new Promise((resolve,reject)=>{
      const s=D.createElement("script");
      s.src=src;s.defer=true;
      s.onload=resolve;s.onerror=reject;
      (D.head||D.documentElement).appendChild(s);
    });
  }

  function render(root,m){
    const total=q(root,"[data-drift-total]");
    total.textContent=signed(m.drift);
    total.setAttribute(
      "data-tone",
      Math.abs(m.drift)<60?"neutral":m.drift>0?"slow":"fast"
    );

    q(root,"[data-drift-sub]").textContent=
      m.drift>0
        ? "recent completed blocks are cumulatively behind the ideal schedule"
        : m.drift<0
          ? "recent completed blocks are cumulatively ahead of the ideal schedule"
          : "recent completed blocks match the ideal schedule";

    q(root,"[data-drift-mean]").textContent=minutes(m.mean);
    q(root,"[data-drift-median]").textContent=minutes(m.median);
    q(root,"[data-drift-fastslow]").textContent=`${m.fast} fast / ${m.slow} slow${m.exact?` / ${m.exact} exact`:""}`;
    q(root,"[data-drift-last]").textContent=signed(m.last-600);
    q(root,"[data-drift-sample]").textContent=`${m.count} completed intervals`;
    q(root,"[data-drift-actual]").textContent=duration(m.actual);
    q(root,"[data-drift-ideal]").textContent=duration(m.ideal);
    q(root,"[data-drift-day]").textContent=m.blocksPerDay.toFixed(1);

    q(root,"[data-drift-meta]").textContent=
      `tip ${Number(m.newest?.height||0).toLocaleString()} · completed intervals only · live tip age handled by clock-drift`;

    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    try{
      if(!W.ZZXChain?.recentBlocks)throw new Error("ZZXChain.recentBlocks unavailable");
      const r=await W.ZZXChain.recentBlocks(false);
      state.model=W.ZZXDriftModel.build(r.blocks,10);
      render(root,state.model);
    }catch(error){
      status(root,state.model?"stale":"offline",state.model?"warn":"error");
      q(root,"[data-drift-meta]").textContent=String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    const state={model:null,busy:false,timer:null};
    root.__zzxDriftState=state;

    try{
      await ensureModel(core||W.ZZXWidgetsCore||null);
      q(root,"[data-drift-refresh]")?.addEventListener("click",()=>refresh(root,state));
      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,15000);
      }

      state.timer=W.setTimeout(loop,15000);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-drift-meta]").textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
