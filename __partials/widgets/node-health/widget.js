// __partials/widgets/node-health/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="node-health";

  function q(root,selector){return root?.querySelector?.(selector)||null;}
  function set(root,selector,value){
    const el=q(root,selector);
    if(el)el.textContent=value==null?"—":String(value);
  }
  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }
  function integer(value){
    const n=finite(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }
  function pct(value){
    const n=finite(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }
  function width(el,value){
    if(!el)return;
    const n=finite(value);
    el.style.width=Number.isFinite(n)
      ? `${Math.max(0,Math.min(100,n*100)).toFixed(2)}%`
      : "0%";
  }
  function status(root,label,state){
    const el=q(root,"[data-node-health-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }
  function tone(el,value,good=.98,warn=.90){
    if(!el)return;
    const n=finite(value);
    if(!Number.isFinite(n)){
      el.removeAttribute("data-tone");
      return;
    }
    el.setAttribute("data-tone",n>=good?"up":n>=warn?"warn":"down");
  }
  function resolve(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }
  function base(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/node-health";
  }

  async function loadScript(path,test,tag){
    if(test())return;

    const src=new URL(resolve(path),W.location.href).href;
    const existing=[...D.scripts].find(script=>script.src===src);

    if(existing){
      const started=Date.now();
      while(!test()&&Date.now()-started<2500){
        await new Promise(done=>W.setTimeout(done,25));
      }
      if(test())return;
    }

    await new Promise((done,fail)=>{
      const script=D.createElement("script");
      script.src=src;
      script.defer=true;
      script.dataset.nodeHealthDependency=tag;
      script.addEventListener("load",done,{once:true});
      script.addEventListener(
        "error",
        ()=>fail(new Error(`Failed to load ${path}`)),
        {once:true}
      );
      (D.head||D.documentElement).appendChild(script);
    });

    if(!test())throw new Error(`${path} did not register ${tag}`);
  }

  async function ensureModules(core){
    await loadScript(
      "/__partials/widgets/_shared/zzx-bitnodes.js",
      ()=>Number(W.ZZXBitnodes?.__version||0)>=8,
      "ZZXBitnodes"
    );
    await loadScript(
      `${base(core)}/js/model.js`,
      ()=>Number(W.ZZXNodeHealthModel?.__version||0)>=2,
      "ZZXNodeHealthModel"
    );
    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXNodeHealthProvider?.__version||0)>=2,
      "ZZXNodeHealthProvider"
    );
    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXNodeHealthUI?.__version||0)>=2,
      "ZZXNodeHealthUI"
    );
    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXNodeHealthViewport?.__version||0)>=2,
      "ZZXNodeHealthViewport"
    );
  }

  function observedText(yes,no,observed,total){
    if(!(observed>0))return "unavailable";
    return `${integer(yes)} up · ${integer(no)} down · ${pct(total>0?observed/total:NaN)} observed`;
  }

  function render(root,state){
    const detail=state.detail;
    const snapshot=detail?.snapshot;
    const m=state.model;
    if(!snapshot||!m)return;

    const syncAvailable=m.heightKnown>0;

    set(
      root,
      "[data-node-health-reach]",
      syncAvailable?`${pct(m.syncShare)} synced`:"height telemetry unavailable"
    );
    set(
      root,
      "[data-node-health-sub]",
      syncAvailable
        ? `${integer(m.synced)} tip-aligned of ${integer(m.heightKnown)} height-known nodes · tip ${integer(m.latestHeight)}`
        : `${integer(m.total)} reachable nodes · no per-node block-height telemetry`
    );

    set(
      root,
      "[data-node-health-now]",
      m.nowObserved>0
        ? `${integer(m.nowTrue)} · ${pct(m.nowReachShare)}`
        : "unavailable"
    );
    set(
      root,
      "[data-node-health-24h]",
      m.dayObserved>0
        ? `${integer(m.dayTrue)} · ${pct(m.dayReachShare)}`
        : "unavailable"
    );
    set(
      root,
      "[data-node-health-sync]",
      m.heightKnown>0
        ? `${integer(m.synced)} / ${integer(m.behind)}`
        : "unavailable"
    );
    set(root,"[data-node-health-dup]",integer(m.duplicateExtra));

    tone(q(root,"[data-node-health-now]"),m.nowReachShare,.98,.90);
    tone(q(root,"[data-node-health-24h]"),m.dayReachShare,.98,.90);
    tone(q(root,"[data-node-health-sync]"),m.syncShare,.95,.85);

    set(
      root,
      "[data-node-health-observed]",
      `${integer(m.heightKnown)} height · ${integer(m.nowObserved)} now · ${integer(m.dayObserved)} 24h`
    );

    set(
      root,
      "[data-node-health-height-coverage]",
      `${integer(m.heightKnown)} / ${integer(m.total)} · ${pct(m.heightCoverage)}`
    );
    set(
      root,
      "[data-node-health-now-coverage]",
      `${integer(m.nowObserved)} / ${integer(m.total)} · ${pct(m.nowCoverage)}`
    );
    set(
      root,
      "[data-node-health-24h-coverage]",
      `${integer(m.dayObserved)} / ${integer(m.total)} · ${pct(m.dayCoverage)}`
    );

    width(q(root,"[data-node-health-height-known]"),m.heightCoverage);
    width(q(root,"[data-node-health-height-unknown]"),Number.isFinite(finite(m.heightCoverage))?1-m.heightCoverage:1);
    width(q(root,"[data-node-health-now-known]"),m.nowCoverage);
    width(q(root,"[data-node-health-now-unknown]"),Number.isFinite(finite(m.nowCoverage))?1-m.nowCoverage:1);
    width(q(root,"[data-node-health-24h-known]"),m.dayCoverage);
    width(q(root,"[data-node-health-24h-unknown]"),Number.isFinite(finite(m.dayCoverage))?1-m.dayCoverage:1);

    set(root,"[data-node-health-lag-count]",`${integer(m.heightKnown)} height-known`);
    set(root,"[data-node-health-lag-synced]",`${integer(m.synced)} · ${pct(m.heightKnown>0?m.synced/m.heightKnown:NaN)}`);
    set(root,"[data-node-health-lag-minor]",`${integer(m.minor)} · ${pct(m.heightKnown>0?m.minor/m.heightKnown:NaN)}`);
    set(root,"[data-node-health-lagging]",`${integer(m.lagging)} · ${pct(m.heightKnown>0?m.lagging/m.heightKnown:NaN)}`);
    set(root,"[data-node-health-stale]",`${integer(m.stale)} · ${pct(m.heightKnown>0?m.stale/m.heightKnown:NaN)}`);

    set(
      root,
      "[data-node-health-network-count]",
      `${m.networkRows.length.toLocaleString()} network${m.networkRows.length===1?"":"s"}`
    );
    const body=q(root,"[data-node-health-body]");
    if(body)W.ZZXNodeHealthUI.renderNetworkRows(body,m.networkRows);

    set(root,"[data-node-health-total]",integer(m.total));
    set(root,"[data-node-health-height]",integer(m.latestHeight));
    set(root,"[data-node-health-height-known-count]",`${integer(m.heightKnown)} · ${pct(m.heightCoverage)}`);
    set(
      root,
      "[data-node-health-now-observed]",
      observedText(m.nowTrue,m.nowFalse,m.nowObserved,m.total)
    );
    set(
      root,
      "[data-node-health-24h-observed]",
      observedText(m.dayTrue,m.dayFalse,m.dayObserved,m.total)
    );

    const rawUpdated=finite(
      snapshot.updatedMs ??
      snapshot.generatedAtMs ??
      snapshot.timestampMs ??
      snapshot.generated_at ??
      snapshot.updated_at ??
      snapshot.timestamp
    );
    const updated=Number.isFinite(rawUpdated)&&rawUpdated>0&&rawUpdated<2e12
      ? rawUpdated*1000
      : rawUpdated;

    set(
      root,
      "[data-node-health-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );
    set(
      root,
      "[data-node-health-source]",
      `${detail.source||snapshot.source||"shared ZZX Bitnodes"} · ${detail.transport||"shared"}${detail.stale?" · stale":""}`
    );
    set(
      root,
      "[data-node-health-meta]",
      "ZZXBitnodes v8 · explicit telemetry availability · block-height lag is relative to latest observed node height"
    );

    status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");

    W.ZZXNodeHealth=Object.freeze({
      schema:"zzx-node-health-export-v2",
      ...m,
      source:detail.source,
      transport:detail.transport,
      updatedMs:Number.isFinite(updated)?updated:null
    });
    W.ZZXNodeHealthLatest=W.ZZXNodeHealth;
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const loaded=await W.ZZXNodeHealthProvider.load(force);
      state.detail=loaded.detail;
      state.model=loaded.model;
      render(root,state);
    }catch(error){
      status(root,state.detail?"stale":"offline",state.detail?"warn":"error");
      set(root,"[data-node-health-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxNodeHealthState;
    old?.unsubscribe?.();
    old?.abortController?.abort?.();
    old?.detachViewport?.();

    const abortController=typeof AbortController==="function"
      ? new AbortController()
      : null;
    const options=abortController?{signal:abortController.signal}:undefined;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      detail:null,
      model:null,
      busy:false,
      unsubscribe:null,
      abortController,
      detachViewport:null
    };
    root.__zzxNodeHealthState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXNodeHealthViewport.attach(root);

      q(root,"[data-node-health-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(detail=>{
          if(!detail?.snapshot||!root.isConnected)return;
          state.detail=detail;
          state.model=W.ZZXNodeHealthModel.build(detail.snapshot);
          render(root,state);
        },{immediate:false});
      }

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-node-health-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
