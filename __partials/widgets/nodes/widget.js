(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="nodes";

  function q(root,selector){
    return root?.querySelector?.(selector)||null;
  }

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

  function age(timestamp){
    const ms=finite(timestamp);
    if(!Number.isFinite(ms)||ms<=0)return "—";

    const sec=Math.max(0,Math.floor((Date.now()-ms)/1000));
    if(sec<60)return `${sec}s`;
    const min=Math.floor(sec/60);
    if(min<60)return `${min}m`;
    const hr=Math.floor(min/60);
    if(hr<24)return `${hr}h`;
    return `${Math.floor(hr/24)}d`;
  }

  function status(root,label,state){
    const el=q(root,"[data-nodes-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  function base(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/nodes";
  }

  function resolve(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }

  async function loadScript(src,test,tag){
    if(test())return;

    const target=new URL(resolve(src),W.location.href).href;
    const existing=[...D.scripts].find(s=>s.src===target);

    if(existing){
      const started=Date.now();
      while(!test()&&Date.now()-started<1800){
        await new Promise(done=>W.setTimeout(done,25));
      }
      if(test())return;
    }

    await new Promise((resolveLoad,reject)=>{
      const script=D.createElement("script");
      script.src=target;
      script.defer=true;
      script.dataset.nodesDependency=tag;
      script.addEventListener("load",resolveLoad,{once:true});
      script.addEventListener("error",reject,{once:true});
      (D.head||D.documentElement).appendChild(script);
    });

    if(!test())throw new Error(`${src} did not register ${tag}`);
  }

  async function ensureModules(core){
    await loadScript(
      "/__partials/widgets/_shared/zzx-bitnodes.js",
      ()=>Number(W.ZZXBitnodes?.__version||0)>=5,
      "ZZXBitnodes"
    );

    await loadScript(
      `${base(core)}/js/chart.js`,
      ()=>Number(W.ZZXNodesChart?.__version||0)>=4,
      "ZZXNodesChart"
    );
  }

  function network(snapshot,key){
    return finite(snapshot?.byNetwork?.[key]);
  }

  function render(root,state){
    const result=state.result;
    const snapshot=result?.snapshot;

    if(!snapshot)return;

    const total=finite(snapshot.reachableNodes);
    const fallbackTotal=finite(snapshot.totalNodes);
    const reachable=Number.isFinite(total)?total:fallbackTotal;

    set(root,"[data-nodes-total]",integer(reachable));
    set(root,"[data-nodes-height]",integer(snapshot.latestHeight));
    set(root,"[data-nodes-tor]",integer(network(snapshot,"tor")));
    set(root,"[data-nodes-ipv4]",integer(network(snapshot,"ipv4")));
    set(root,"[data-nodes-ipv6]",integer(network(snapshot,"ipv6")));
    set(root,"[data-nodes-i2p]",integer(network(snapshot,"i2p")));
    set(root,"[data-nodes-cjdns]",integer(network(snapshot,"cjdns")));
    set(root,"[data-nodes-other]",integer(network(snapshot,"other")));
    set(root,"[data-nodes-decoded]",integer(snapshot.nodeCount));

    const updated=finite(snapshot.updatedMs);
    set(
      root,
      "[data-nodes-age]",
      Number.isFinite(updated)?`${age(updated)} old`:"timestamp unavailable"
    );
    set(
      root,
      "[data-nodes-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );
    set(root,"[data-nodes-transport]",`${result.transport}${result.stale?" · stale":""}`);
    set(root,"[data-nodes-source]",result.source||snapshot.source||"—");

    set(
      root,
      "[data-nodes-sub]",
      `height ${integer(snapshot.latestHeight)} · ${integer(snapshot.nodeCount)} decoded node record${Number(snapshot.nodeCount)===1?"":"s"}`
    );

    set(
      root,
      "[data-nodes-meta]",
      "shared ZZXBitnodes v5 · local /bitcoin/bitnodes/ mirror first · btcnodes.io / compatible mirror fallback"
    );

    status(
      root,
      result.stale?"cached":"live",
      result.stale?"warn":"ok"
    );
  }

  function draw(root,state){
    W.ZZXNodesChart?.draw?.(
      q(root,"[data-nodes-canvas]"),
      state.history
    );
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXBitnodes.load(force);
      state.history=await W.ZZXBitnodes.history(force);
      render(root,state);

      set(
        root,
        "[data-nodes-history]",
        `${state.history.length.toLocaleString()} point${state.history.length===1?"":"s"}`
      );

      draw(root,state);
    }catch(error){
      status(root,state.result?"stale":"offline",state.result?"warn":"error");
      set(root,"[data-nodes-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxNodesState;
    old?.unsubscribe?.();
    old?.resize?.disconnect?.();

    const state={
      core:core||W.ZZXWidgetsCore||null,
      result:null,
      history:[],
      busy:false,
      unsubscribe:null,
      resize:null
    };

    root.__zzxNodesState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-nodes-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true)
      );

      state.unsubscribe=W.ZZXBitnodes.subscribe(
        async detail=>{
          state.result=detail;
          state.history=await W.ZZXBitnodes.history();
          render(root,state);
          set(
            root,
            "[data-nodes-history]",
            `${state.history.length.toLocaleString()} point${state.history.length===1?"":"s"}`
          );
          draw(root,state);
        },
        {immediate:false}
      );

      if("ResizeObserver" in W){
        state.resize=new ResizeObserver(()=>{
          W.requestAnimationFrame(()=>draw(root,state));
        });
        const canvas=q(root,"[data-nodes-canvas]");
        if(canvas)state.resize.observe(canvas);
      }

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-nodes-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
