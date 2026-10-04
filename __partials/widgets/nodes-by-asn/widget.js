// __partials/widgets/nodes-by-asn/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="nodes-by-asn";

  const GEO_KEY="zzx.widget.nodes-by-asn.geo.v10.30";
  const SORT_KEY="zzx.widget.nodes-by-asn.sort.v10.30";

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

  function safeGet(key){
    try{return W.localStorage.getItem(key);}catch(_){return null;}
  }

  function safeSet(key,value){
    try{W.localStorage.setItem(key,String(value));}catch(_){}
  }

  function status(root,label,state){
    const el=q(root,"[data-nbasn-status]");
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
      : "/__partials/widgets/nodes-by-asn";
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
      script.dataset.nbasnDependency=tag;
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
      ()=>Number(W.ZZXNodesByAsnModel?.__version||0)>=2,
      "ZZXNodesByAsnModel"
    );

    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXNodesByAsnProvider?.__version||0)>=2,
      "ZZXNodesByAsnProvider"
    );

    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXNodesByAsnUI?.__version||0)>=2,
      "ZZXNodesByAsnUI"
    );

    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXNodesByAsnViewport?.__version||0)>=2,
      "ZZXNodesByAsnViewport"
    );
  }

  function geoFilter(root){
    return String(q(root,"[data-nbasn-geo]")?.value||"all");
  }

  function sortMode(root){
    return String(q(root,"[data-nbasn-sort]")?.value||"nodes");
  }

  function filtered(root,state){
    let rows=[...(state.model?.rows||[])];

    const geo=geoFilter(root);
    if(geo==="located"){
      rows=rows.filter(row=>row.located);
    }else if(geo==="unlocated"){
      rows=rows.filter(row=>!row.located);
    }

    const needle=String(q(root,"[data-nbasn-search]")?.value||"")
      .trim()
      .toLowerCase();

    if(needle){
      rows=rows.filter(row=>
        [
          row.asn,
          row.organization,
          row.country,
          row.countryName,
          row.nationLabel
        ].join(" ").toLowerCase().includes(needle)
      );
    }

    switch(sortMode(root)){
      case "asn":
        rows.sort((a,b)=>
          a.asnNumber-b.asnNumber ||
          b.nodes-a.nodes ||
          a.organization.localeCompare(b.organization)
        );
        break;

      case "organization":
        rows.sort((a,b)=>
          a.organization.localeCompare(b.organization) ||
          b.nodes-a.nodes ||
          a.asnNumber-b.asnNumber
        );
        break;

      case "nation":
        rows.sort((a,b)=>
          (a.countryName||"Unlocated").localeCompare(b.countryName||"Unlocated") ||
          b.nodes-a.nodes ||
          a.asnNumber-b.asnNumber
        );
        break;

      default:
        rows.sort((a,b)=>
          b.nodes-a.nodes ||
          a.asnNumber-b.asnNumber ||
          a.organization.localeCompare(b.organization)
        );
    }

    return rows;
  }

  function renderReadout(root,state,{resetScroll=false}={}){
    const rows=filtered(root,state);

    const body=q(root,"[data-nbasn-body]");
    if(body){
      W.ZZXNodesByAsnUI.renderRows(body,rows,0);
    }

    const total=state.model?.rows?.length||0;
    set(
      root,
      "[data-nbasn-visible-count]",
      `${rows.length.toLocaleString()} visible / ${total.toLocaleString()} total ASN/nation row${total===1?"":"s"}`
    );

    if(resetScroll){
      const scroller=q(root,"[data-nbasn-scroll]");
      if(scroller)scroller.scrollTop=0;
    }
  }

  function render(root,state){
    const detail=state.detail;
    const snapshot=detail?.snapshot;
    const m=state.model;

    if(!snapshot||!m)return;

    set(root,"[data-nbasn-summary]",`${integer(m.observed)} nodes`);

    set(
      root,
      "[data-nbasn-sub]",
      `${integer(m.asnCount)} autonomous systems · ${integer(m.organizationCount)} organizations · ${pct(m.coverage)} reachable-node ASN coverage`
    );

    set(root,"[data-nbasn-count]",integer(m.asnCount));
    set(root,"[data-nbasn-org-count]",integer(m.organizationCount));

    set(
      root,
      "[data-nbasn-top]",
      m.top?`${m.top.asn} · ${m.top.organization}`:"—"
    );

    set(root,"[data-nbasn-coverage]",pct(m.coverage));

    set(
      root,
      "[data-nbasn-coverage-label]",
      `${integer(m.observed)} / ${integer(m.denominator)} identified`
    );

    set(
      root,
      "[data-nbasn-known]",
      `${integer(m.observed)} · ${pct(m.coverage)}`
    );

    set(
      root,
      "[data-nbasn-unknown]",
      `${integer(m.unidentified)} · ${pct(m.denominator>0?m.unidentified/m.denominator:NaN)}`
    );

    set(
      root,
      "[data-nbasn-located]",
      `${integer(m.located)} · ${pct(m.locatedShare)}`
    );

    width(q(root,"[data-nbasn-bar-known]"),m.coverage);
    width(
      q(root,"[data-nbasn-bar-unknown]"),
      Number.isFinite(finite(m.coverage))?1-m.coverage:NaN
    );

    const leaders=q(root,"[data-nbasn-leaders]");
    if(leaders){
      W.ZZXNodesByAsnUI.renderLeaders(leaders,m.leaders);
    }

    set(
      root,
      "[data-nbasn-leader-count]",
      `${Math.min(5,m.leaders.length)} of ${m.leaders.length.toLocaleString()}`
    );

    set(root,"[data-nbasn-network-total]",integer(m.denominator));
    set(root,"[data-nbasn-decoded]",integer(snapshot.nodeCount));
    set(root,"[data-nbasn-identified]",integer(m.observed));
    set(root,"[data-nbasn-unidentified]",integer(m.unidentified));

    set(
      root,
      "[data-nbasn-nation-located]",
      `${integer(m.located)} · ${m.countryCount.toLocaleString()} nation${m.countryCount===1?"":"s"}`
    );

    const rawUpdated=finite(
      snapshot.updatedMs ??
      snapshot.generatedAtMs ??
      snapshot.timestampMs ??
      snapshot.generated_at ??
      snapshot.updated_at ??
      snapshot.timestamp
    );

    const updated=
      Number.isFinite(rawUpdated)&&rawUpdated>0&&rawUpdated<2e12
        ? rawUpdated*1000
        : rawUpdated;

    set(
      root,
      "[data-nbasn-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );

    set(
      root,
      "[data-nbasn-source]",
      `${detail.source||snapshot.source||"shared ZZX Bitnodes"} · ${detail.transport||"shared"}${detail.stale?" · stale":""} · geo ${snapshot.geography?.source||"unavailable"}`
    );

    set(
      root,
      "[data-nbasn-meta]",
      "DB-IP ASN via Map Host exact-address join · full scrollable ASN/nation readout · structured ASN/organization + flag/nation/ISO · no pagination"
    );

    renderReadout(root,state);
    status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");

    W.ZZXNodesByAsn=Object.freeze({
      schema:"zzx-nodes-by-asn-export-v3",
      rows:m.rows,
      leaders:m.leaders,
      asnCount:m.asnCount,
      organizationCount:m.organizationCount,
      countryCount:m.countryCount,
      observed:m.observed,
      located:m.located,
      unidentified:m.unidentified,
      denominator:m.denominator,
      coverage:m.coverage,
      locatedShare:m.locatedShare,
      source:detail.source,
      transport:detail.transport,
      updatedMs:Number.isFinite(updated)?updated:null
    });

    W.ZZXNodesByAsnLatest=W.ZZXNodesByAsn;
  }

  function rerenderFiltered(root,state){
    renderReadout(root,state,{resetScroll:true});
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const loaded=await W.ZZXNodesByAsnProvider.load(force);
      state.detail=loaded.detail;
      state.model=loaded.model;
      render(root,state);
    }catch(error){
      status(root,state.detail?"stale":"offline",state.detail?"warn":"error");
      set(root,"[data-nbasn-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxNodesByAsnState;
    old?.unsubscribe?.();
    old?.abortController?.abort?.();
    old?.detachViewport?.();

    if(old?.searchTimer){
      W.clearTimeout(old.searchTimer);
    }

    const abortController=
      typeof AbortController==="function"
        ? new AbortController()
        : null;

    const options=
      abortController
        ? {signal:abortController.signal}
        : undefined;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      detail:null,
      model:null,
      busy:false,
      searchTimer:null,
      unsubscribe:null,
      abortController,
      detachViewport:null
    };

    root.__zzxNodesByAsnState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXNodesByAsnViewport.attach(root);

      const geo=q(root,"[data-nbasn-geo]");
      const savedGeo=safeGet(GEO_KEY);

      if(geo&&["all","located","unlocated"].includes(savedGeo)){
        geo.value=savedGeo;
      }

      const sort=q(root,"[data-nbasn-sort]");
      const savedSort=safeGet(SORT_KEY);

      if(sort&&["nodes","asn","organization","nation"].includes(savedSort)){
        sort.value=savedSort;
      }

      q(root,"[data-nbasn-search]")?.addEventListener(
        "input",
        ()=>{
          if(state.searchTimer){
            W.clearTimeout(state.searchTimer);
          }

          state.searchTimer=W.setTimeout(
            ()=>rerenderFiltered(root,state),
            100
          );
        },
        options
      );

      geo?.addEventListener(
        "change",
        ()=>{
          safeSet(GEO_KEY,geoFilter(root));
          rerenderFiltered(root,state);
        },
        options
      );

      sort?.addEventListener(
        "change",
        ()=>{
          safeSet(SORT_KEY,sortMode(root));
          rerenderFiltered(root,state);
        },
        options
      );

      q(root,"[data-nbasn-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(
          detail=>{
            if(!detail?.snapshot||!root.isConnected)return;

            state.detail=detail;
            state.model=W.ZZXNodesByAsnModel.build(detail.snapshot);
            render(root,state);
          },
          {immediate:false}
        );
      }

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-nbasn-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
