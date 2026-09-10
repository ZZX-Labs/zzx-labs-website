// __partials/widgets/node-network-mix/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="node-network-mix";

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
  function width(el,value){
    if(!el)return;
    const n=finite(value);
    el.style.width=Number.isFinite(n)
      ? `${Math.max(0,Math.min(100,n*100)).toFixed(2)}%`
      : "0%";
  }
  function status(root,label,state){
    const el=q(root,"[data-node-network-mix-status]");
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
      : "/__partials/widgets/node-network-mix";
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
      script.dataset.nodeNetworkMixDependency=tag;
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
      ()=>Number(W.ZZXNodeNetworkMixModel?.__version||0)>=2,
      "ZZXNodeNetworkMixModel"
    );
    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXNodeNetworkMixProvider?.__version||0)>=2,
      "ZZXNodeNetworkMixProvider"
    );
    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXNodeNetworkMixUI?.__version||0)>=2,
      "ZZXNodeNetworkMixUI"
    );
    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXNodeNetworkMixViewport?.__version||0)>=2,
      "ZZXNodeNetworkMixViewport"
    );
  }

  function countAndShare(m,key){
    const value=Number(m.counts?.[key]||0);
    return `${integer(value)} · ${pct(m.total>0?value/m.total:NaN)}`;
  }

  function render(root,state){
    const detail=state.detail;
    const snapshot=detail?.snapshot;
    const m=state.model;
    if(!snapshot||!m)return;

    set(root,"[data-node-network-mix-total]",integer(m.total));
    set(
      root,
      "[data-node-network-mix-sub]",
      `${integer(m.observed)} classified/other rows · ${pct(m.coverage)} population coverage · ${m.mode}`
    );

    set(root,"[data-node-network-mix-ipv4]",countAndShare(m,"ipv4"));
    set(root,"[data-node-network-mix-ipv6]",countAndShare(m,"ipv6"));
    set(root,"[data-node-network-mix-tor]",countAndShare(m,"tor"));
    set(
      root,
      "[data-node-network-mix-overlay]",
      `${integer(m.counts.i2p)} / ${integer(m.counts.cjdns)}`
    );

    set(
      root,
      "[data-node-network-mix-coverage-label]",
      `${integer(m.observed)} / ${integer(m.total)} accounted`
    );
    set(
      root,
      "[data-node-network-mix-classified]",
      `${integer(m.classifiedKnown)} · ${pct(m.knownCoverage)}`
    );
    set(
      root,
      "[data-node-network-mix-other]",
      `${integer(m.other)} · ${pct(m.total>0?m.other/m.total:NaN)}`
    );
    set(
      root,
      "[data-node-network-mix-dominant]",
      m.dominant
        ? `${W.ZZXNodeNetworkMixUI.label(m.dominant.network)} · ${pct(m.dominant.share)}`
        : "—"
    );

    for(const key of ["ipv4","ipv6","tor","i2p","cjdns","other"]){
      width(
        q(root,`[data-node-network-mix-stack-${key}]`),
        m.total>0?Number(m.counts[key]||0)/m.total:NaN
      );
    }

    set(
      root,
      "[data-node-network-mix-network-count]",
      `${m.rows.length.toLocaleString()} network${m.rows.length===1?"":"s"}`
    );
    set(
      root,
      "[data-node-network-mix-table-count]",
      `${m.rows.length.toLocaleString()} ranked row${m.rows.length===1?"":"s"}`
    );

    const bars=q(root,"[data-node-network-mix-bars]");
    if(bars)W.ZZXNodeNetworkMixUI.renderBars(bars,m.rows);

    const body=q(root,"[data-node-network-mix-body]");
    if(body)W.ZZXNodeNetworkMixUI.renderRows(body,m.rows);

    set(root,"[data-node-network-mix-reachable]",integer(m.total));
    set(root,"[data-node-network-mix-decoded]",integer(snapshot.nodeCount));
    set(root,"[data-node-network-mix-classified-count]",integer(m.observed));
    set(
      root,
      "[data-node-network-mix-unclassified]",
      `${integer(m.unclassified)} · ${pct(m.total>0?m.unclassified/m.total:NaN)}`
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
      "[data-node-network-mix-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );
    set(
      root,
      "[data-node-network-mix-source]",
      `${detail.source||snapshot.source||"shared ZZX Bitnodes"} · ${detail.transport||"shared"}${detail.stale?" · stale":""}`
    );
    set(
      root,
      "[data-node-network-mix-meta]",
      "ZZXBitnodes v8 · normalized IPv4/IPv6/Tor/I2P/CJDNS/Other transport buckets · no duplicate upstream request"
    );

    status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");

    W.ZZXNodeNetworkMix=Object.freeze({
      schema:"zzx-node-network-mix-export-v2",
      ...m,
      source:detail.source,
      transport:detail.transport,
      updatedMs:Number.isFinite(updated)?updated:null
    });
    W.ZZXNodeNetworkMixLatest=W.ZZXNodeNetworkMix;
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const loaded=await W.ZZXNodeNetworkMixProvider.load(force);
      state.detail=loaded.detail;
      state.model=loaded.model;
      render(root,state);
    }catch(error){
      status(root,state.detail?"stale":"offline",state.detail?"warn":"error");
      set(root,"[data-node-network-mix-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxNodeNetworkMixState;
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
    root.__zzxNodeNetworkMixState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXNodeNetworkMixViewport.attach(root);

      q(root,"[data-node-network-mix-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(detail=>{
          if(!detail?.snapshot||!root.isConnected)return;
          state.detail=detail;
          state.model=W.ZZXNodeNetworkMixModel.build(detail.snapshot);
          render(root,state);
        },{immediate:false});
      }

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-node-network-mix-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
