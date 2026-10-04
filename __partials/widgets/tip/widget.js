// __partials/widgets/tip/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="tip";

  function q(root,sel){
    return root?root.querySelector(sel):null;
  }

  function set(root,sel,value){
    const el=q(root,sel);
    if(el)el.textContent=String(value??"—");
  }

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? Math.trunc(n).toLocaleString()
      : "—";
  }

  function status(root,label,state){
    const el=q(root,"[data-tip-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/tip";

    for(const [globalName,relative] of [
      ["ZZXTipSources","js/sources.js"],
      ["ZZXTipFetch","js/fetch.js"],
      ["ZZXTipProvider","js/provider.js"]
    ]){
      if(W[globalName])continue;

      const raw=`${base}/${relative}`;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;

      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;
        s.defer=true;
        s.addEventListener("load",resolve,{once:true});
        s.addEventListener("error",reject,{once:true});
        (D.head||D.documentElement).appendChild(s);
      });

      if(!W[globalName]){
        throw new Error(
          `${relative} did not register ${globalName}`
        );
      }
    }
  }

  function render(root,state){
    const r=state.result;

    set(root,"[data-tip-height]",int(r.height));

    set(
      root,
      "[data-tip-sub]",
      r.transport==="shared"
        ? "shared ZZX chain state"
        : "live mempool chain tip"
    );

    set(
      root,
      "[data-tip-source]",
      `${r.source} · ${r.transport}`
    );

    set(
      root,
      "[data-tip-updated]",
      new Date().toLocaleString()
    );

    set(
      root,
      "[data-tip-meta]",
      "current Bitcoin chain-tip height · 15s refresh"
    );

    W.ZZXTipLatest={
      height:Number(r.height),
      source:r.source,
      transport:r.transport,
      updated_at:Date.now()
    };

    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    const button=q(root,"[data-tip-refresh]");
    if(button)button.disabled=true;

    try{
      state.result=await W.ZZXTipProvider.load(
        state.core
      );

      render(root,state);
    }catch(error){
      status(
        root,
        state.result?"stale":"offline",
        state.result?"warn":"error"
      );

      set(
        root,
        "[data-tip-meta]",
        `error: ${String(error?.message||error)}`
      );
    }finally{
      state.busy=false;
      if(button)button.disabled=false;
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

    root.__zzxTipState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-tip-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state)
      );

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;

        await refresh(root,state);

        state.timer=W.setTimeout(
          loop,
          W.ZZXTipSources.refreshMs
        );
      }

      state.timer=W.setTimeout(
        loop,
        W.ZZXTipSources.refreshMs
      );
    }catch(error){
      status(root,"offline","error");

      set(
        root,
        "[data-tip-meta]",
        String(error?.message||error)
      );
    }
  }

  if(W.ZZXAPI?.register){
    W.ZZXAPI.register(ID,boot);
  }else if(W.ZZXWidgetsCore?.onMount){
    W.ZZXWidgetsCore.onMount(ID,boot);
  }else if(W.ZZXWidgets?.register){
    W.ZZXWidgets.register(ID,boot);
  }
})();
