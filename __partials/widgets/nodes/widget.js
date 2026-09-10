// __partials/widgets/nodes/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="nodes";

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
  function width(el,value){
    if(!el)return;
    const n=finite(value);
    el.style.width=Number.isFinite(n)
      ? `${Math.max(0,Math.min(100,n*100)).toFixed(2)}%`
      : "0%";
  }
  function status(root,label,state){
    const el=q(root,"[data-nodes-status]");
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
      : "/__partials/widgets/nodes";
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
      script.dataset.nodesDependency=tag;
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
      ()=>Number(W.ZZXNodesModel?.__version||0)>=5,
      "ZZXNodesModel"
    );
    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXNodesProvider?.__version||0)>=5,
      "ZZXNodesProvider"
    );
    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXNodesUI?.__version||0)>=5,
      "ZZXNodesUI"
    );
    await loadScript(
      `${base(core)}/js/ipaddresses.js`,
      ()=>Number(W.ZZXNodeIPAddresses?.__version||0)>=1,
      "ZZXNodeIPAddresses"
    );
    await loadScript(
      `${base(core)}/js/chart.js`,
      ()=>Number(W.ZZXNodesChart?.__version||0)>=5,
      "ZZXNodesChart"
    );
    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXNodesViewport?.__version||0)>=5,
      "ZZXNodesViewport"
    );
  }

  function countShare(m,key){
    const value=Number(m.networkCounts?.[key]||0);
    return `${integer(value)} · ${pct(m.total>0?value/m.total:NaN)}`;
  }

  function filteredIPRows(root,state){
    let rows=state.ipAddresses?.rows||[];

    const version=String(q(root,"[data-nodes-ip-version]")?.value||"all");
    if(version==="4")rows=rows.filter(row=>row.version===4);
    else if(version==="6")rows=rows.filter(row=>row.version===6);

    const needle=String(q(root,"[data-nodes-ip-search]")?.value||"")
      .trim()
      .toLowerCase();

    if(needle){
      rows=rows.filter(row=>
        [
          row.ip,
          row.address,
          row.network,
          row.port
        ].join(" ").toLowerCase().includes(needle)
      );
    }

    return rows;
  }

  function renderIPRows(root,state){
    const body=q(root,"[data-nodes-ip-body]");
    if(!body)return;

    const rows=filteredIPRows(root,state);
    body.replaceChildren();

    set(
      root,
      "[data-nodes-ip-count]",
      `${rows.length.toLocaleString()} visible / ${(state.ipAddresses?.count||0).toLocaleString()} total`
    );

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="nodes__ip-empty";
      empty.textContent="No IP addresses match this filter.";
      body.appendChild(empty);
      return;
    }

    const fragment=D.createDocumentFragment();

    rows.forEach((item,index)=>{
      const row=D.createElement("div");
      row.className="nodes__ip-row";
      row.setAttribute("role","row");

      const rank=D.createElement("div");
      rank.textContent=String(index+1);

      const ip=D.createElement("div");
      ip.className="nodes__ip-address";
      ip.textContent=item.ip;
      ip.title=item.address;

      const network=D.createElement("div");
      const badge=D.createElement("span");
      badge.className="nodes__ip-badge";
      badge.textContent=item.version===6?"IPv6":"IPv4";
      network.appendChild(badge);

      const port=D.createElement("div");
      port.className="nodes__num";
      port.textContent=item.port==null?"—":String(item.port);

      const count=D.createElement("div");
      count.className="nodes__num";
      count.textContent=Number(item.count||1).toLocaleString();

      row.append(rank,ip,network,port,count);
      fragment.appendChild(row);
    });

    body.appendChild(fragment);
  }

  async function copyVisibleIPs(root,state){
    const rows=filteredIPRows(root,state);
    if(!rows.length)return;

    const text=rows.map(row=>row.ip).join("\\n");
    const button=q(root,"[data-nodes-ip-copy]");

    try{
      await W.navigator.clipboard.writeText(text);
      if(button){
        const prior=button.textContent;
        button.textContent=`Copied ${rows.length.toLocaleString()}`;
        W.setTimeout(()=>{button.textContent=prior;},1200);
      }
    }catch(_){
      if(button){
        button.textContent="Copy failed";
        W.setTimeout(()=>{button.textContent="Copy visible";},1200);
      }
    }
  }

  function render(root,state){
    const detail=state.detail;
    const snapshot=detail?.snapshot;
    const m=state.model;
    if(!snapshot||!m)return;

    state.ipAddresses=W.ZZXNodeIPAddresses.build(snapshot);
    set(root,"[data-nodes-ipv4-count]",integer(state.ipAddresses.ipv4Count));
    set(root,"[data-nodes-ipv6-count]",integer(state.ipAddresses.ipv6Count));
    set(root,"[data-nodes-ip-overlay]",integer(state.ipAddresses.overlayOrHostname));
    renderIPRows(root,state);

    set(root,"[data-nodes-total]",integer(m.total));
    set(root,"[data-nodes-height]",integer(m.latestHeight));
    set(root,"[data-nodes-decoded]",integer(m.nodeCount));
    set(
      root,
      "[data-nodes-dominant]",
      m.dominant
        ? `${W.ZZXNodesUI.label(m.dominant.network)} · ${pct(m.dominant.share)}`
        : "—"
    );
    set(root,"[data-nodes-network-coverage]",pct(m.networkCoverage));

    set(
      root,
      "[data-nodes-sub]",
      `${integer(m.nodeCount)} decoded rows · height ${integer(m.latestHeight)} · ${m.networkMode} transport classification`
    );

    set(root,"[data-nodes-ipv4]",countShare(m,"ipv4"));
    set(root,"[data-nodes-ipv6]",countShare(m,"ipv6"));
    set(root,"[data-nodes-tor]",countShare(m,"tor"));
    set(root,"[data-nodes-i2p]",countShare(m,"i2p"));
    set(root,"[data-nodes-cjdns]",countShare(m,"cjdns"));
    set(root,"[data-nodes-other]",countShare(m,"other"));

    set(
      root,
      "[data-nodes-network-count]",
      `${m.networkRows.length.toLocaleString()} observed network${m.networkRows.length===1?"":"s"}`
    );

    for(const key of ["ipv4","ipv6","tor","i2p","cjdns","other"]){
      width(
        q(root,`[data-nodes-stack-${key}]`),
        m.total>0?Number(m.networkCounts[key]||0)/m.total:NaN
      );
    }

    set(
      root,
      "[data-nodes-coverage-summary]",
      `${integer(m.geoKnown)} geo · ${integer(m.asnKnown)} ASN · ${integer(m.latencyKnown)} latency · ${integer(m.heightKnown)} height`
    );

    set(root,"[data-nodes-geo-coverage]",`${integer(m.geoKnown)} · ${pct(m.geoCoverage)}`);
    set(root,"[data-nodes-asn-coverage]",`${integer(m.asnKnown)} · ${pct(m.asnCoverage)}`);
    set(root,"[data-nodes-latency-coverage]",`${integer(m.latencyKnown)} · ${pct(m.latencyCoverage)}`);
    set(root,"[data-nodes-height-coverage]",`${integer(m.heightKnown)} · ${pct(m.heightCoverage)}`);

    width(q(root,"[data-nodes-geo-bar]"),m.geoCoverage);
    width(q(root,"[data-nodes-asn-bar]"),m.asnCoverage);
    width(q(root,"[data-nodes-latency-bar]"),m.latencyCoverage);
    width(q(root,"[data-nodes-height-bar]"),m.heightCoverage);

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

    set(root,"[data-nodes-geo-joins]",integer(m.geoJoined));
    set(root,"[data-nodes-asn-groups]",integer(m.asnGroups));
    set(
      root,
      "[data-nodes-transport]",
      `${detail.transport||"shared"}${detail.stale?" · stale":""}`
    );
    set(root,"[data-nodes-source]",detail.source||snapshot.source||"—");

    set(
      root,
      "[data-nodes-meta]",
      "ZZXBitnodes v8 · one canonical browser snapshot · no browser-level direct upstream or proxy requests"
    );

    status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");

    W.ZZXNodesOverview=Object.freeze({
      schema:"zzx-nodes-overview-export-v6",
      ...m,
      ipAddresses:state.ipAddresses,
      source:detail.source,
      transport:detail.transport,
      updatedMs:Number.isFinite(updated)?updated:null
    });
    W.ZZXNodesLatest=W.ZZXNodesOverview;
  }

  function draw(root,state){
    W.ZZXNodesChart?.draw?.(
      q(root,"[data-nodes-canvas]"),
      state.history
    );
  }

  function renderHistoryLabel(root,state){
    const rows=Array.isArray(state.history)?state.history:[];
    if(rows.length<2){
      set(
        root,
        "[data-nodes-history]",
        `${rows.length.toLocaleString()} point${rows.length===1?"":"s"}`
      );
      return;
    }

    const first=Number(rows[0]?.total ?? rows[0]?.v ?? rows[0]?.[1]);
    const last=Number(rows[rows.length-1]?.total ?? rows[rows.length-1]?.v ?? rows[rows.length-1]?.[1]);
    const delta=Number.isFinite(first)&&Number.isFinite(last)?last-first:NaN;

    set(
      root,
      "[data-nodes-history]",
      `${rows.length.toLocaleString()} points${Number.isFinite(delta)?` · Δ ${delta>=0?"+":""}${Math.round(delta).toLocaleString()}`:""}`
    );
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const loaded=await W.ZZXNodesProvider.load(force);
      state.detail=loaded.detail;
      state.model=loaded.model;
      state.history=await W.ZZXNodesProvider.history(force);

      render(root,state);
      renderHistoryLabel(root,state);
      draw(root,state);
    }catch(error){
      status(root,state.detail?"stale":"offline",state.detail?"warn":"error");
      set(root,"[data-nodes-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxNodesState;
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
      history:[],
      ipAddresses:null,
      busy:false,
      unsubscribe:null,
      abortController,
      detachViewport:null
    };
    root.__zzxNodesState=state;

    try{
      await ensureModules(state.core);

      state.detachViewport=W.ZZXNodesViewport.attach(
        root,
        ()=>draw(root,state)
      );

      q(root,"[data-nodes-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      q(root,"[data-nodes-ip-search]")?.addEventListener(
        "input",
        ()=>renderIPRows(root,state),
        options
      );

      q(root,"[data-nodes-ip-version]")?.addEventListener(
        "change",
        ()=>{
          const scroller=q(root,"[data-nodes-ip-scroll]");
          if(scroller)scroller.scrollTop=0;
          renderIPRows(root,state);
        },
        options
      );

      q(root,"[data-nodes-ip-copy]")?.addEventListener(
        "click",
        ()=>copyVisibleIPs(root,state),
        options
      );

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(async detail=>{
          if(!detail?.snapshot||!root.isConnected)return;

          state.detail=detail;
          state.model=W.ZZXNodesModel.build(detail.snapshot);
          state.history=await W.ZZXNodesProvider.history(false);

          render(root,state);
          renderHistoryLabel(root,state);
          draw(root,state);
        },{immediate:false});
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
