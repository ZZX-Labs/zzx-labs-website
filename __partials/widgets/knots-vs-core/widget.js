// __partials/widgets/knots-vs-core/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="knots-vs-core";

  function q(root,sel){return root?root.querySelector(sel):null}

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function pct(v){
    const n=Number(v);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function width(el,fraction){
    if(!el)return;
    const n=Number(fraction);
    el.style.width=Number.isFinite(n)?`${Math.max(0,Math.min(100,n*100)).toFixed(2)}%`:"0%";
  }

  function status(root,label,state){
    const el=q(root,"[data-kvc-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/knots-vs-core";

    for(const [globalName,relative] of [
      ["ZZXKnotsCoreModel","js/model.js"],
      ["ZZXKnotsCoreProvider","js/provider.js"]
    ]){
      if(W[globalName])continue;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(`${base}/${relative}`):`${base}/${relative}`;
      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;s.defer=true;
        s.onload=resolve;s.onerror=reject;
        (D.head||D.documentElement).appendChild(s);
      });
    }
  }

  function render(root,state){
    const m=state.result.model;

    q(root,"[data-kvc-summary]").textContent=
      `Core ${pct(m.coreVsKnots)} · Knots ${pct(m.knotsVsCore)}`;

    q(root,"[data-kvc-sub]").textContent=
      "Core-vs-Knots ratio uses only explicitly identified Core and Knots agents; other clients stay separate";

    q(root,"[data-kvc-total-reach]").textContent=int(m.total);
    q(root,"[data-kvc-core-reach]").textContent=int(m.core);
    q(root,"[data-kvc-knots-reach]").textContent=int(m.knots);
    q(root,"[data-kvc-other-reach]").textContent=int(m.other);

    q(root,"[data-kvc-core-pct]").textContent=pct(m.corePct);
    q(root,"[data-kvc-knots-pct]").textContent=pct(m.knotsPct);
    q(root,"[data-kvc-other-pct]").textContent=pct(m.otherPct);

    width(q(root,"[data-kvc-bar-core]"),m.corePct);
    width(q(root,"[data-kvc-bar-knots]"),m.knotsPct);
    width(q(root,"[data-kvc-bar-other]"),m.otherPct);

    q(root,"[data-kvc-core-row]").textContent=int(m.core);
    q(root,"[data-kvc-knots-row]").textContent=int(m.knots);
    q(root,"[data-kvc-other-row]").textContent=int(m.other);

    q(root,"[data-kvc-core-tor]").textContent=int(m.torCore);
    q(root,"[data-kvc-knots-tor]").textContent=int(m.torKnots);
    q(root,"[data-kvc-other-tor]").textContent=int(m.torOther);

    q(root,"[data-kvc-core-row-pct]").textContent=pct(m.corePct);
    q(root,"[data-kvc-knots-row-pct]").textContent=pct(m.knotsPct);
    q(root,"[data-kvc-other-row-pct]").textContent=pct(m.otherPct);

    q(root,"[data-kvc-unreachable]").textContent=
      Number.isFinite(m.unreachable)
        ? `${int(m.unreachable)} network-wide · not attributed to client`
        : "not supplied by current source";

    q(root,"[data-kvc-generated]").textContent=
      state.result.generated
        ? new Date(state.result.generated).toLocaleString()
        : "—";

    q(root,"[data-kvc-source]").textContent=state.result.source;

    q(root,"[data-kvc-note]").textContent=
      "local ZZX Bitnodes data · explicit UA buckets · non-Knots nodes are never silently relabeled as Core";

    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXKnotsCoreProvider.load();
      render(root,state);
    }catch(error){
      status(root,state.result?"stale":"offline",state.result?"warn":"error");
      q(root,"[data-kvc-note]").textContent=String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      result:null,
      busy:false,
      timer:null
    };

    root.__zzxKnotsCoreState=state;

    try{
      await ensureModules(state.core);
      q(root,"[data-kvc-refresh]")?.addEventListener("click",()=>refresh(root,state));
      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,600000);
      }

      state.timer=W.setTimeout(loop,600000);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-kvc-note]").textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
