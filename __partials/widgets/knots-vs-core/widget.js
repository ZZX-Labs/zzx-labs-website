// __partials/widgets/knots-vs-core/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="knots-vs-core";

  const NATION_SORT_KEY="zzx.widget.knots-vs-core.nation-sort.v10.32";
  const CLIENT_KEY="zzx.widget.knots-vs-core.client.v10.32";
  const GEO_KEY="zzx.widget.knots-vs-core.geo.v10.32";
  const VERSION_SORT_KEY="zzx.widget.knots-vs-core.version-sort.v10.32";

  function q(root,selector){
    return root?.querySelector?.(selector)||null;
  }

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

  function int(value){
    const n=finite(value);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function pct(value){
    const n=finite(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function width(el,fraction){
    if(!el)return;
    const n=finite(fraction);
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
    const el=q(root,"[data-kvc-status]");
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
      : "/__partials/widgets/knots-vs-core";
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
      script.dataset.kvcDependency=tag;
      script.addEventListener("load",done,{once:true});
      script.addEventListener(
        "error",
        ()=>fail(new Error(`Failed to load ${path}`)),
        {once:true}
      );
      (D.head||D.documentElement).appendChild(script);
    });

    if(!test()){
      throw new Error(`${path} did not register ${tag}`);
    }
  }

  async function ensureModules(core){
    await loadScript(
      "/__partials/widgets/_shared/zzx-bitnodes.js",
      ()=>Number(W.ZZXBitnodes?.__version||0)>=8,
      "ZZXBitnodes"
    );

    await loadScript(
      "/__partials/widgets/nodes-by-version/js/model.js",
      ()=>Number(W.ZZXNodesByVersionModel?.__version||0)>=2,
      "ZZXNodesByVersionModel"
    );

    await loadScript(
      `${base(core)}/js/model.js`,
      ()=>Number(W.ZZXKnotsCoreModel?.__version||0)>=5,
      "ZZXKnotsCoreModel"
    );

    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXKnotsCoreProvider?.__version||0)>=5,
      "ZZXKnotsCoreProvider"
    );

    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXKnotsCoreUI?.__version||0)>=6,
      "ZZXKnotsCoreUI"
    );

    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXKnotsCoreViewport?.__version||0)>=6,
      "ZZXKnotsCoreViewport"
    );
  }

  function filteredNationRows(root,state){
    const needle=String(q(root,"[data-kvc-nation-search]")?.value||"")
      .trim()
      .toLowerCase();

    const sort=String(q(root,"[data-kvc-nation-sort]")?.value||"total-desc");

    let rows=[...(state.result?.model?.nationRows||[])];

    if(needle){
      rows=rows.filter(row=>
        [
          row.country,
          row.countryName,
          row.flag,
          row.nationLabel
        ].join(" ").toLowerCase().includes(needle)
      );
    }

    switch(sort){
      case "core-desc":
        rows.sort((a,b)=>
          b.core-a.core ||
          b.total-a.total ||
          a.countryName.localeCompare(b.countryName)
        );
        break;

      case "knots-desc":
        rows.sort((a,b)=>
          b.knots-a.knots ||
          b.total-a.total ||
          a.countryName.localeCompare(b.countryName)
        );
        break;

      case "nation":
        rows.sort((a,b)=>
          a.countryName.localeCompare(b.countryName) ||
          a.country.localeCompare(b.country)
        );
        break;

      default:
        rows.sort((a,b)=>
          b.total-a.total ||
          a.countryName.localeCompare(b.countryName)
        );
    }

    return rows;
  }

  function filteredVersionRows(root,state){
    const needle=String(q(root,"[data-kvc-search]")?.value||"")
      .trim()
      .toLowerCase();

    const client=String(q(root,"[data-kvc-client]")?.value||"all");
    const geo=String(q(root,"[data-kvc-geo]")?.value||"all");
    const sort=String(q(root,"[data-kvc-sort]")?.value||"count-desc");

    let rows=[...(state.result?.model?.exactRows||[])];

    if(client!=="all"){
      rows=rows.filter(row=>row.family===client);
    }

    if(geo==="located"){
      rows=rows.filter(row=>row.located);
    }else if(geo==="unlocated"){
      rows=rows.filter(row=>!row.located);
    }

    if(needle){
      rows=rows.filter(row=>
        [
          row.family,
          row.version,
          row.userAgent,
          row.country,
          row.countryName,
          row.flag,
          row.nationLabel
        ].join(" ").toLowerCase().includes(needle)
      );
    }

    if(sort==="client-version"){
      rows.sort((a,b)=>
        a.family.localeCompare(b.family) ||
        String(a.version).localeCompare(
          String(b.version),
          undefined,
          {numeric:true}
        ) ||
        a.userAgent.localeCompare(b.userAgent) ||
        a.countryName.localeCompare(b.countryName)
      );
    }else if(sort==="share-desc"){
      rows.sort((a,b)=>
        (b.shareIdentified||0)-(a.shareIdentified||0) ||
        b.count-a.count ||
        a.userAgent.localeCompare(b.userAgent)
      );
    }else{
      rows.sort((a,b)=>
        b.count-a.count ||
        a.userAgent.localeCompare(b.userAgent) ||
        a.countryName.localeCompare(b.countryName)
      );
    }

    return rows;
  }

  function renderNations(root,state,{resetScroll=false}={}){
    const rows=filteredNationRows(root,state);
    const total=state.result?.model?.nationRows?.length||0;

    set(
      root,
      "[data-kvc-nation-count]",
      `${rows.length.toLocaleString()} visible / ${total.toLocaleString()} total`
    );

    const body=q(root,"[data-kvc-nation-body]");
    if(body){
      W.ZZXKnotsCoreUI.renderNationRows(body,rows);
    }

    if(resetScroll){
      const scroller=q(root,"[data-kvc-nation-scroll]");
      if(scroller)scroller.scrollTop=0;
    }
  }

  function renderVersions(root,state,{resetScroll=false}={}){
    const rows=filteredVersionRows(root,state);
    const total=state.result?.model?.exactRows?.length||0;

    set(
      root,
      "[data-kvc-version-count]",
      `${rows.length.toLocaleString()} matching`
    );

    set(
      root,
      "[data-kvc-version-visible]",
      `${rows.length.toLocaleString()} visible / ${total.toLocaleString()} total`
    );

    const body=q(root,"[data-kvc-version-body]");
    if(body){
      W.ZZXKnotsCoreUI.renderVersionRows(body,rows);
    }

    if(resetScroll){
      const scroller=q(root,"[data-kvc-version-scroll]");
      if(scroller)scroller.scrollTop=0;
    }
  }

  function render(root,state){
    const r=state.result;
    const m=r.model;

    set(
      root,
      "[data-kvc-summary]",
      `Core ${pct(m.coreVsKnots)} · Knots ${pct(m.knotsVsCore)}`
    );

    set(
      root,
      "[data-kvc-sub]",
      `Core-vs-Knots uses only explicit Core + Knots UAs · ${int(m.identified)} identified of ${int(m.total)} reachable`
    );

    set(root,"[data-kvc-total-reach]",int(m.total));
    set(root,"[data-kvc-core-reach]",int(m.core));
    set(root,"[data-kvc-knots-reach]",int(m.knots));
    set(root,"[data-kvc-other-reach]",int(m.other));

    set(root,"[data-kvc-core-pct]",pct(m.corePct));
    set(root,"[data-kvc-knots-pct]",pct(m.knotsPct));
    set(root,"[data-kvc-other-pct]",pct(m.otherPct));
    set(root,"[data-kvc-coverage]",`${pct(m.coverage)} identified`);

    width(q(root,"[data-kvc-bar-core]"),m.corePct);
    width(q(root,"[data-kvc-bar-knots]"),m.knotsPct);
    width(q(root,"[data-kvc-bar-other]"),m.otherPct);

    set(root,"[data-kvc-core-row]",int(m.core));
    set(root,"[data-kvc-knots-row]",int(m.knots));
    set(root,"[data-kvc-other-row]",int(m.other));

    set(root,"[data-kvc-core-tor]",int(m.torCore));
    set(root,"[data-kvc-knots-tor]",int(m.torKnots));
    set(root,"[data-kvc-other-tor]",int(m.torOther));

    set(root,"[data-kvc-core-row-pct]",pct(m.corePct));
    set(root,"[data-kvc-knots-row-pct]",pct(m.knotsPct));
    set(root,"[data-kvc-other-row-pct]",pct(m.otherPct));

    set(
      root,
      "[data-kvc-identification]",
      `${int(m.identified)} / ${int(m.total)} · ${pct(m.coverage)} · ${int(m.unidentifiedReachable)} reachable without decoded UA`
    );

    set(
      root,
      "[data-kvc-unreachable]",
      Number.isFinite(m.unreachable)
        ? `${int(m.unreachable)} network-wide · not attributed to client`
        : "not supplied by current snapshot"
    );

    set(
      root,
      "[data-kvc-generated]",
      r.generated?new Date(r.generated).toLocaleString():"—"
    );

    set(
      root,
      "[data-kvc-source]",
      `${r.source} · ${r.transport}${r.stale?" · stale":""}`
    );

    set(
      root,
      "[data-kvc-note]",
      "shared ZZXBitnodes v8 · continuous nation + exact-version scroll matrices · exact UA classification · verified Map Host geography · no pagination"
    );

    renderNations(root,state);
    renderVersions(root,state);

    status(root,r.stale?"cached":"live",r.stale?"warn":"ok");

    W.ZZXKnotsVsCoreLatest=Object.freeze({
      schema:"zzx-knots-vs-core-export-v3",
      ...m,
      source:r.source,
      transport:r.transport,
      generated:r.generated
    });
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXKnotsCoreProvider.load(force);
      render(root,state);
    }catch(error){
      status(root,state.result?"stale":"offline",state.result?"warn":"error");
      set(root,"[data-kvc-note]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxKnotsCoreState;
    old?.unsubscribe?.();
    old?.abortController?.abort?.();
    old?.detachViewport?.();

    if(old?.nationSearchTimer)W.clearTimeout(old.nationSearchTimer);
    if(old?.versionSearchTimer)W.clearTimeout(old.versionSearchTimer);

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
      busy:false,
      unsubscribe:null,
      abortController,
      nationSearchTimer:null,
      versionSearchTimer:null,
      detachViewport:null
    };

    root.__zzxKnotsCoreState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXKnotsCoreViewport.attach(root);

      const nationSort=q(root,"[data-kvc-nation-sort]");
      const savedNationSort=safeGet(NATION_SORT_KEY);
      if(
        nationSort &&
        ["total-desc","core-desc","knots-desc","nation"].includes(savedNationSort)
      ){
        nationSort.value=savedNationSort;
      }

      const client=q(root,"[data-kvc-client]");
      const savedClient=safeGet(CLIENT_KEY);
      if(
        client &&
        ["all","Bitcoin Core","Bitcoin Knots"].includes(savedClient)
      ){
        client.value=savedClient;
      }

      const geo=q(root,"[data-kvc-geo]");
      const savedGeo=safeGet(GEO_KEY);
      if(geo&&["all","located","unlocated"].includes(savedGeo)){
        geo.value=savedGeo;
      }

      const versionSort=q(root,"[data-kvc-sort]");
      const savedVersionSort=safeGet(VERSION_SORT_KEY);
      if(
        versionSort &&
        ["count-desc","share-desc","client-version"].includes(savedVersionSort)
      ){
        versionSort.value=savedVersionSort;
      }

      q(root,"[data-kvc-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      q(root,"[data-kvc-nation-search]")?.addEventListener(
        "input",
        ()=>{
          if(state.nationSearchTimer){
            W.clearTimeout(state.nationSearchTimer);
          }

          state.nationSearchTimer=W.setTimeout(
            ()=>renderNations(root,state,{resetScroll:true}),
            100
          );
        },
        options
      );

      nationSort?.addEventListener(
        "change",
        ()=>{
          safeSet(NATION_SORT_KEY,nationSort.value);
          renderNations(root,state,{resetScroll:true});
        },
        options
      );

      client?.addEventListener(
        "change",
        ()=>{
          safeSet(CLIENT_KEY,client.value);
          renderVersions(root,state,{resetScroll:true});
        },
        options
      );

      geo?.addEventListener(
        "change",
        ()=>{
          safeSet(GEO_KEY,geo.value);
          renderVersions(root,state,{resetScroll:true});
        },
        options
      );

      versionSort?.addEventListener(
        "change",
        ()=>{
          safeSet(VERSION_SORT_KEY,versionSort.value);
          renderVersions(root,state,{resetScroll:true});
        },
        options
      );

      q(root,"[data-kvc-search]")?.addEventListener(
        "input",
        ()=>{
          if(state.versionSearchTimer){
            W.clearTimeout(state.versionSearchTimer);
          }

          state.versionSearchTimer=W.setTimeout(
            ()=>renderVersions(root,state,{resetScroll:true}),
            100
          );
        },
        options
      );

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(
          detail=>{
            if(!detail?.snapshot||!root.isConnected)return;
            refresh(root,state,false);
          },
          {immediate:false}
        );
      }

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-kvc-note]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
