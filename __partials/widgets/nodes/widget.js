// __partials/widgets/nodes/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="nodes";

  function q(root,sel){
    return root?root.querySelector(sel):null;
  }

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? Math.round(n).toLocaleString()
      : "—";
  }

  function age(ms){
    const n=Number(ms);
    if(!Number.isFinite(n)||n<=0)return "—";

    const sec=Math.max(
      0,
      Math.floor((Date.now()-n)/1000)
    );

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

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/nodes";

    for(const [globalName,relative] of [
      ["ZZXNodesSources","js/sources.js"],
      ["ZZXNodesFetch","js/fetch.js"],
      ["ZZXNodesAdapter","js/adapter.js"],
      ["ZZXNodesProvider","js/provider.js"],
      ["ZZXNodesHistory","js/history.js"],
      ["ZZXNodesChart","js/chart.js"]
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

  function draw(root,state){
    W.ZZXNodesChart.draw(
      q(root,"[data-nodes-canvas]"),
      state.history
    );
  }

  function render(root,state){
    const r=state.result;
    const m=r.model;
    const total=
      Number.isFinite(m.reachableNodes)
        ? m.reachableNodes
        : m.totalNodes;

    q(root,"[data-nodes-total]").textContent=int(total);
    q(root,"[data-nodes-height]").textContent=int(m.latestHeight);
    q(root,"[data-nodes-tor]").textContent=int(m.tor);
    q(root,"[data-nodes-ipv4]").textContent=int(m.ipv4);
    q(root,"[data-nodes-ipv6]").textContent=int(m.ipv6);
    q(root,"[data-nodes-other]").textContent=int(m.other);

    q(root,"[data-nodes-age]").textContent=
      Number.isFinite(m.updatedMs)
        ? `${age(m.updatedMs)} old`
        : "—";

    q(root,"[data-nodes-updated]").textContent=
      Number.isFinite(m.updatedMs)
        ? new Date(m.updatedMs).toLocaleString()
        : "—";

    q(root,"[data-nodes-source]").textContent=
      `${r.source} · ${r.transport}${r.stale?" · stale cache":""}`;

    q(root,"[data-nodes-sub]").textContent=
      `height ${int(m.latestHeight)} · ${
        Number.isFinite(m.tor)
          ? `${int(m.tor)} Tor-visible`
          : "network mix unavailable"
      }`;

    q(root,"[data-nodes-meta]").textContent=
      `local ZZX mirror first · public fallback https://btcnodes.io/api/v1/snapshots/latest/ · 15m refresh`;

    state.history=W.ZZXNodesHistory.push(total);

    q(root,"[data-nodes-history]").textContent=
      `${state.history.length} point${state.history.length===1?"":"s"}`;

    // Stable export for dependent widgets.
    W.ZZXNodesLatest={
      total_nodes:Number(m.totalNodes),
      reachable_nodes:Number(m.reachableNodes),
      latest_height:Number(m.latestHeight),
      timestamp_ms:Number(m.updatedMs),
      ipv4_nodes:Number(m.ipv4),
      ipv6_nodes:Number(m.ipv6),
      tor_nodes:Number(m.tor),
      other_nodes:Number(m.other),
      source:r.source,
      transport:r.transport,
      stale:!!r.stale
    };

    draw(root,state);
    status(root,r.stale?"cached":"live",r.stale?"warn":"ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXNodesProvider.load();
      render(root,state);
    }catch(error){
      status(
        root,
        state.result?"stale":"offline",
        state.result?"warn":"error"
      );

      q(root,"[data-nodes-meta]").textContent=
        String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      result:null,
      history:[],
      busy:false,
      timer:null,
      resize:null
    };

    root.__zzxNodesState=state;

    try{
      await ensureModules(state.core);

      state.history=W.ZZXNodesHistory.load();

      q(root,"[data-nodes-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state)
      );

      if("ResizeObserver" in W){
        state.resize=new ResizeObserver(()=>{
          W.requestAnimationFrame(
            ()=>draw(root,state)
          );
        });

        state.resize.observe(
          q(root,"[data-nodes-canvas]")
        );
      }

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;

        await refresh(root,state);

        state.timer=W.setTimeout(
          loop,
          W.ZZXNodesSources.refreshMs
        );
      }

      state.timer=W.setTimeout(
        loop,
        W.ZZXNodesSources.refreshMs
      );
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-nodes-meta]").textContent=
        String(error?.message||error);
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
