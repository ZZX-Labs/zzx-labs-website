// __partials/widgets/node-latency/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="node-latency";

  function q(root,selector){return root?.querySelector?.(selector)||null;}
  function set(root,selector,value){
    const el=q(root,selector);
    if(el)el.textContent=value==null?"—":String(value);
  }
  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
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
  function ms(value){
    const n=finite(value);
    return Number.isFinite(n)?`${n.toFixed(1)} ms`:"—";
  }
  function width(el,value){
    if(!el)return;
    const n=finite(value);
    el.style.width=Number.isFinite(n)
      ? `${Math.max(0,Math.min(100,n*100)).toFixed(2)}%`
      : "0%";
  }
  function status(root,label,state){
    const el=q(root,"[data-node-latency-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }
  function resolve(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }
  function base(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/node-latency";
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
      script.dataset.nodeLatencyDependency=tag;
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
      ()=>Number(W.ZZXNodeLatencyModel?.__version||0)>=2,
      "ZZXNodeLatencyModel"
    );
    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXNodeLatencyProvider?.__version||0)>=2,
      "ZZXNodeLatencyProvider"
    );
    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXNodeLatencyUI?.__version||0)>=2,
      "ZZXNodeLatencyUI"
    );
    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXNodeLatencyViewport?.__version||0)>=2,
      "ZZXNodeLatencyViewport"
    );
  }

  function latencyTone(el,value){
    if(!el)return;
    const n=finite(value);
    if(!Number.isFinite(n)){
      el.removeAttribute("data-tone");
      return;
    }
    el.setAttribute(
      "data-tone",
      n<150?"good":n<300?"warn":"slow"
    );
  }

  function bucket(root,selector,barSelector,count,total){
    const share=total>0?count/total:NaN;
    set(root,selector,total>0?`${integer(count)} · ${pct(share)}`:"—");
    width(q(root,barSelector),share);
  }

  function render(root,state){
    const detail=state.detail;
    const snapshot=detail?.snapshot;
    const m=state.model;
    if(!snapshot||!m)return;

    const available=m.sampleCount>0;

    set(root,"[data-node-latency-p50]",available?ms(m.p50):"unavailable");
    set(root,"[data-node-latency-avg]",available?ms(m.avg):"—");
    set(root,"[data-node-latency-p90]",available?ms(m.p90):"—");
    set(root,"[data-node-latency-p95]",available?ms(m.p95):"—");
    set(root,"[data-node-latency-p99]",available?ms(m.p99):"—");

    latencyTone(q(root,"[data-node-latency-p50]"),m.p50);
    latencyTone(q(root,"[data-node-latency-avg]"),m.avg);
    latencyTone(q(root,"[data-node-latency-p95]"),m.p95);
    latencyTone(q(root,"[data-node-latency-p99]"),m.p99);

    set(
      root,
      "[data-node-latency-sub]",
      available
        ? `${integer(m.sampleCount)} latency samples · ${pct(m.coverage)} reachable-node coverage · ${m.mode==="per-node"?"per-node telemetry":"aggregate-only telemetry"}`
        : "current normalized snapshot publishes no usable latency telemetry"
    );

    set(
      root,
      "[data-node-latency-coverage-label]",
      `${integer(m.sampleCount)} / ${integer(m.total)} sampled`
    );
    set(root,"[data-node-latency-samples]",`${integer(m.sampleCount)} · ${pct(m.coverage)}`);
    set(root,"[data-node-latency-unsampled]",integer(m.unsampled));
    set(root,"[data-node-latency-mode]",m.mode==="per-node"?"per-node":"aggregate only");

    width(q(root,"[data-node-latency-bar-known]"),m.coverage);
    width(
      q(root,"[data-node-latency-bar-unknown]"),
      Number.isFinite(finite(m.coverage))?1-m.coverage:1
    );

    if(m.mode==="per-node"&&m.buckets){
      const b=m.buckets;
      bucket(root,"[data-node-latency-bucket-fast]","[data-node-latency-bucket-fast-bar]",b.fast,m.sampleCount);
      bucket(root,"[data-node-latency-bucket-good]","[data-node-latency-bucket-good-bar]",b.good,m.sampleCount);
      bucket(root,"[data-node-latency-bucket-moderate]","[data-node-latency-bucket-moderate-bar]",b.moderate,m.sampleCount);
      bucket(root,"[data-node-latency-bucket-slow]","[data-node-latency-bucket-slow-bar]",b.slow,m.sampleCount);
      bucket(root,"[data-node-latency-bucket-very-slow]","[data-node-latency-bucket-very-slow-bar]",b.verySlow,m.sampleCount);
      set(root,"[data-node-latency-bucket-total]",`${integer(m.sampleCount)} samples`);
    }else{
      for(const selector of [
        "[data-node-latency-bucket-fast]",
        "[data-node-latency-bucket-good]",
        "[data-node-latency-bucket-moderate]",
        "[data-node-latency-bucket-slow]",
        "[data-node-latency-bucket-very-slow]"
      ])set(root,selector,"aggregate only");

      for(const selector of [
        "[data-node-latency-bucket-fast-bar]",
        "[data-node-latency-bucket-good-bar]",
        "[data-node-latency-bucket-moderate-bar]",
        "[data-node-latency-bucket-slow-bar]",
        "[data-node-latency-bucket-very-slow-bar]"
      ])width(q(root,selector),0);

      set(root,"[data-node-latency-bucket-total]","distribution unavailable");
    }

    const sampledNetworks=(m.networkRows||[]).filter(row=>row.sampleCount>0);
    set(
      root,
      "[data-node-latency-network-count]",
      m.mode==="per-node"
        ? `${sampledNetworks.length.toLocaleString()} sampled network${sampledNetworks.length===1?"":"s"}`
        : "aggregate only"
    );

    const body=q(root,"[data-node-latency-body]");
    if(body){
      W.ZZXNodeLatencyUI.renderNetworkRows(
        body,
        m.networkRows||[],
        m.mode
      );
    }

    set(root,"[data-node-latency-total]",integer(m.total));
    set(root,"[data-node-latency-min]",ms(m.min));
    set(root,"[data-node-latency-max]",ms(m.max));
    set(root,"[data-node-latency-invalid]",integer(m.invalidCount));

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
      "[data-node-latency-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );
    set(
      root,
      "[data-node-latency-source]",
      `${detail.source||snapshot.source||"shared ZZX Bitnodes"} · ${detail.transport||"shared"}${detail.stale?" · stale":""}`
    );
    set(
      root,
      "[data-node-latency-meta]",
      `ZZXBitnodes v8 · ${m.mode} · non-negative published latencyMs only · no synthetic latency`
    );

    status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");

    W.ZZXNodeLatency=Object.freeze({
      schema:"zzx-node-latency-export-v2",
      ...m,
      source:detail.source,
      transport:detail.transport,
      updatedMs:Number.isFinite(updated)?updated:null
    });
    W.ZZXNodeLatencyLatest=W.ZZXNodeLatency;
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const loaded=await W.ZZXNodeLatencyProvider.load(force);
      state.detail=loaded.detail;
      state.model=loaded.model;
      render(root,state);
    }catch(error){
      status(root,state.detail?"stale":"offline",state.detail?"warn":"error");
      set(root,"[data-node-latency-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxNodeLatencyState;
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
    root.__zzxNodeLatencyState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXNodeLatencyViewport.attach(root);

      q(root,"[data-node-latency-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(detail=>{
          if(!detail?.snapshot||!root.isConnected)return;
          state.detail=detail;
          state.model=W.ZZXNodeLatencyModel.build(detail.snapshot);
          render(root,state);
        },{immediate:false});
      }

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-node-latency-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
