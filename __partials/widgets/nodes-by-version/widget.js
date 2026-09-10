// __partials/widgets/nodes-by-version/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="nodes-by-version";
  const FAMILY_KEY="zzx.widget.nodes-by-version.family.v10.31";
  const GEO_KEY="zzx.widget.nodes-by-version.geo.v10.31";

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

  function safeGet(key){
    try{return W.localStorage.getItem(key);}catch(_){return null;}
  }

  function safeSet(key,value){
    try{W.localStorage.setItem(key,String(value));}catch(_){}
  }

  function status(root,label,state){
    const el=q(root,"[data-nbv-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  function base(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/nodes-by-version";
  }

  function resolve(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }

  function width(el,value){
    if(!el)return;
    const n=finite(value);
    el.style.width=Number.isFinite(n)
      ? `${Math.max(0,Math.min(100,n*100)).toFixed(2)}%`
      : "0%";
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
      script.dataset.nbvDependency=tag;
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
      ()=>Number(W.ZZXNodesByVersionModel?.__version||0)>=3,
      "ZZXNodesByVersionModel"
    );

    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXNodesByVersionUI?.__version||0)>=3,
      "ZZXNodesByVersionUI"
    );

    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXNodesByVersionViewport?.__version||0)>=3,
      "ZZXNodesByVersionViewport"
    );
  }

  function familyFilter(root){
    return String(q(root,"[data-nbv-family]")?.value||"all");
  }

  function geoFilter(root){
    return String(q(root,"[data-nbv-geo]")?.value||"all");
  }

  function familyMatches(row,filter){
    if(filter==="all")return true;

    if(filter==="Other"){
      return row.family!=="Bitcoin Core"&&row.family!=="Bitcoin Knots";
    }

    return row.family===filter;
  }

  function filtered(root,state){
    let rows=[...(state.model?.rows||[])];

    const family=familyFilter(root);
    const geo=geoFilter(root);
    const needle=String(q(root,"[data-nbv-search]")?.value||"")
      .trim()
      .toLowerCase();

    rows=rows.filter(row=>familyMatches(row,family));

    if(geo==="located"){
      rows=rows.filter(row=>row.located);
    }else if(geo==="unlocated"){
      rows=rows.filter(row=>!row.located);
    }

    if(needle){
      rows=rows.filter(row=>
        [
          row.userAgent,
          row.family,
          row.version,
          row.country,
          row.countryName,
          row.nationLabel
        ].join(" ").toLowerCase().includes(needle)
      );
    }

    return rows;
  }

  function renderReadout(root,state,{resetScroll=false}={}){
    const rows=filtered(root,state);
    const body=q(root,"[data-nbv-body]");

    if(body){
      W.ZZXNodesByVersionUI.renderRows(body,rows,0);
    }

    const total=state.model?.rowCount||0;

    set(
      root,
      "[data-nbv-visible-count]",
      `${rows.length.toLocaleString()} visible / ${total.toLocaleString()} total version/nation row${total===1?"":"s"}`
    );

    if(resetScroll){
      const scroller=q(root,"[data-nbv-scroll]");
      if(scroller)scroller.scrollTop=0;
    }
  }

  function render(root,state){
    const result=state.result;
    const snapshot=result?.snapshot;
    const m=state.model;

    if(!snapshot||!m)return;

    const coverage=finite(m.coverage);
    const top=m.topAgent;

    set(root,"[data-nbv-summary]",`${integer(m.totalObserved)} nodes`);

    set(
      root,
      "[data-nbv-sub]",
      `${m.distinctAgents.toLocaleString()} exact user-agent string${m.distinctAgents===1?"":"s"} · `+
      `${m.rowCount.toLocaleString()} version × nation rows · `+
      `${Number.isFinite(coverage)?pct(coverage):"coverage unavailable"}`
    );

    set(root,"[data-nbv-version-count]",m.distinctAgents.toLocaleString());
    set(root,"[data-nbv-top-agent]",top?.userAgent||"—");
    set(root,"[data-nbv-top-share]",top?pct(top.share):"—");
    set(root,"[data-nbv-coverage]",Number.isFinite(coverage)?pct(coverage):"—");

    set(root,"[data-nbv-core]",`${integer(m.core)} · ${pct(m.coreShare)}`);
    set(root,"[data-nbv-knots]",`${integer(m.knots)} · ${pct(m.knotsShare)}`);
    set(root,"[data-nbv-other]",`${integer(m.other)} · ${pct(m.otherShare)}`);
    set(root,"[data-nbv-family-count]",m.distinctFamilies.toLocaleString());

    set(
      root,
      "[data-nbv-mix-label]",
      `Core ${pct(m.coreShare)} · Knots ${pct(m.knotsShare)} · Other ${pct(m.otherShare)}`
    );

    width(q(root,"[data-nbv-mix-core]"),m.coreShare);
    width(q(root,"[data-nbv-mix-knots]"),m.knotsShare);
    width(q(root,"[data-nbv-mix-other]"),m.otherShare);

    set(root,"[data-nbv-network-total]",integer(m.reachable));
    set(root,"[data-nbv-decoded]",integer(m.decoded));
    set(root,"[data-nbv-height]",integer(snapshot.latestHeight));

    set(
      root,
      "[data-nbv-location-summary]",
      `${integer(m.locatedObserved)} located · ${integer(m.unlocatedObserved)} unlocated`
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
      "[data-nbv-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );

    set(
      root,
      "[data-nbv-source]",
      `${result.source||snapshot.source||"—"} · ${result.transport||"shared"}${result.stale?" · stale":""} · geo ${snapshot.geography?.source||"unavailable"}`
    );

    set(
      root,
      "[data-nbv-meta]",
      "ZZXBitnodes v8 · full scrollable version × nation matrix · structured client family + flag/nation/ISO · no pagination"
    );

    renderReadout(root,state);
    status(root,result.stale?"cached":"live",result.stale?"warn":"ok");

    W.ZZXNodesByVersion=Object.freeze({
      schema:"zzx-nodes-by-version-export-v4",
      rows:m.rows,
      agents:m.agents,
      families:m.families,
      totalObserved:m.totalObserved,
      locatedObserved:m.locatedObserved,
      unlocatedObserved:m.unlocatedObserved,
      geographySource:m.geographySource,
      reachable:m.reachable,
      decoded:m.decoded,
      core:m.core,
      knots:m.knots,
      other:m.other,
      source:result.source,
      transport:result.transport,
      updatedMs:Number.isFinite(updated)?updated:null
    });

    W.ZZXNodesByVersionLatest=W.ZZXNodesByVersion;
  }

  function rerenderFiltered(root,state){
    renderReadout(root,state,{resetScroll:true});
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXBitnodes.load(force);
      state.model=W.ZZXNodesByVersionModel.build(state.result.snapshot);
      render(root,state);
    }catch(error){
      status(root,state.result?"stale":"offline",state.result?"warn":"error");
      set(root,"[data-nbv-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxNodesByVersionState;
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
      result:null,
      model:null,
      busy:false,
      searchTimer:null,
      unsubscribe:null,
      abortController,
      detachViewport:null
    };

    root.__zzxNodesByVersionState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXNodesByVersionViewport.attach(root);

      const family=q(root,"[data-nbv-family]");
      const savedFamily=safeGet(FAMILY_KEY);

      if(
        family &&
        ["all","Bitcoin Core","Bitcoin Knots","Other"].includes(savedFamily)
      ){
        family.value=savedFamily;
      }

      const geo=q(root,"[data-nbv-geo]");
      const savedGeo=safeGet(GEO_KEY);

      if(geo&&["all","located","unlocated"].includes(savedGeo)){
        geo.value=savedGeo;
      }

      q(root,"[data-nbv-search]")?.addEventListener(
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

      family?.addEventListener(
        "change",
        ()=>{
          safeSet(FAMILY_KEY,familyFilter(root));
          rerenderFiltered(root,state);
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

      q(root,"[data-nbv-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(
          detail=>{
            if(!detail?.snapshot||!root.isConnected)return;

            state.result=detail;
            state.model=W.ZZXNodesByVersionModel.build(detail.snapshot);
            render(root,state);
          },
          {immediate:false}
        );
      }

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-nbv-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
