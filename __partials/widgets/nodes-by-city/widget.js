// __partials/widgets/nodes-by-city/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="nodes-by-city";
  const SORT_KEY="zzx.widget.nodes-by-city.sort.v10.28";

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
    const el=q(root,"[data-nbc-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }
  function base(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/nodes-by-city";
  }
  function resolve(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
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
      script.dataset.nbcDependency=tag;
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
      ()=>Number(W.ZZXNodesByCityModel?.__version||0)>=4,
      "ZZXNodesByCityModel"
    );
    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXNodesByCityProvider?.__version||0)>=4,
      "ZZXNodesByCityProvider"
    );
    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXNodesByCityUI?.__version||0)>=4,
      "ZZXNodesByCityUI"
    );
    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXNodesByCityViewport?.__version||0)>=4,
      "ZZXNodesByCityViewport"
    );
  }

  function sortMode(root){
    return String(q(root,"[data-nbc-sort]")?.value||"nodes");
  }

  function filtered(root,state){
    let rows=[...(state.model?.rows||[])];

    const needle=String(q(root,"[data-nbc-search]")?.value||"")
      .trim()
      .toLowerCase();

    if(needle){
      rows=rows.filter(row=>
        [
          row.city,
          row.region,
          row.country,
          row.countryName,
          row.nationLabel,
          row.label,
          row.flag
        ].join(" ").toLowerCase().includes(needle)
      );
    }

    switch(sortMode(root)){
      case "city":
        rows.sort((a,b)=>
          a.city.localeCompare(b.city) ||
          a.region.localeCompare(b.region) ||
          a.country.localeCompare(b.country)
        );
        break;

      case "region":
        rows.sort((a,b)=>
          (a.region||"\uffff").localeCompare(b.region||"\uffff") ||
          a.city.localeCompare(b.city) ||
          a.country.localeCompare(b.country)
        );
        break;

      case "nation":
        rows.sort((a,b)=>
          a.countryName.localeCompare(b.countryName) ||
          a.region.localeCompare(b.region) ||
          a.city.localeCompare(b.city)
        );
        break;

      case "iso":
        rows.sort((a,b)=>
          a.country.localeCompare(b.country) ||
          a.region.localeCompare(b.region) ||
          a.city.localeCompare(b.city)
        );
        break;

      case "share":
        rows.sort((a,b)=>
          b.geoShare-a.geoShare ||
          b.nodes-a.nodes ||
          a.countryName.localeCompare(b.countryName) ||
          a.city.localeCompare(b.city)
        );
        break;

      default:
        rows.sort((a,b)=>
          b.nodes-a.nodes ||
          a.countryName.localeCompare(b.countryName) ||
          a.region.localeCompare(b.region) ||
          a.city.localeCompare(b.city)
        );
    }

    return rows;
  }

  function renderReadout(root,state,{resetScroll=false}={}){
    const rows=filtered(root,state);
    const body=q(root,"[data-nbc-body]");

    if(body){
      W.ZZXNodesByCityUI.renderRows(body,rows);
    }

    set(
      root,
      "[data-nbc-visible-count]",
      `${rows.length.toLocaleString()} visible / ${(state.model?.cityCount||0).toLocaleString()} total`
    );

    if(resetScroll){
      const scroller=q(root,"[data-nbc-scroll]");
      if(scroller)scroller.scrollTop=0;
    }
  }

  function render(root,state){
    const detail=state.detail;
    const snapshot=detail?.snapshot;
    const m=state.model;
    if(!snapshot||!m)return;

    set(root,"[data-nbc-summary]",`${integer(m.geolocatedTotal)} nodes`);
    set(
      root,
      "[data-nbc-sub]",
      `${m.cityCount.toLocaleString()} city/region/nation row${m.cityCount===1?"":"s"} · ${pct(m.coverage)} reachable-node city coverage · ${m.mode}`
    );

    set(root,"[data-nbc-city-count]",m.cityCount.toLocaleString());
    set(
      root,
      "[data-nbc-top-city]",
      m.top
        ? `${m.top.city}${m.top.region?` · ${m.top.region}`:""} · ${m.top.flag||"🏴"} ${m.top.countryName} · ${m.top.country}`
        : "—"
    );
    set(root,"[data-nbc-top-share]",m.top?pct(m.top.share):"—");
    set(root,"[data-nbc-coverage]",pct(m.coverage));

    set(
      root,
      "[data-nbc-coverage-label]",
      `${integer(m.geolocatedTotal)} / ${integer(m.denominator)} city-geolocated`
    );

    width(q(root,"[data-nbc-bar-known]"),m.coverage);
    width(
      q(root,"[data-nbc-bar-unknown]"),
      Number.isFinite(finite(m.coverage))?1-m.coverage:1
    );

    set(
      root,
      "[data-nbc-known]",
      `${integer(m.geolocatedTotal)} · ${pct(m.coverage)}`
    );
    set(
      root,
      "[data-nbc-unknown]",
      `${integer(m.unidentified)} · ${pct(m.denominator>0?m.unidentified/m.denominator:NaN)}`
    );
    set(root,"[data-nbc-geo-joins]",integer(m.geographyJoined));

    const leaders=q(root,"[data-nbc-leaders]");
    if(leaders){
      W.ZZXNodesByCityUI.renderLeaders(leaders,m.rows);
    }

    set(
      root,
      "[data-nbc-leader-count]",
      `${Math.min(5,m.cityCount)} of ${m.cityCount.toLocaleString()}`
    );

    set(root,"[data-nbc-network-total]",integer(m.reachable??m.denominator));
    set(root,"[data-nbc-decoded]",integer(m.decoded));
    set(root,"[data-nbc-unlocated]",integer(m.unidentified));
    set(root,"[data-nbc-nation-count]",integer(m.nationCount));
    set(root,"[data-nbc-geo-source]",m.geographySource||"unavailable");

    const updated=finite(snapshot.updatedMs);

    set(
      root,
      "[data-nbc-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );

    set(
      root,
      "[data-nbc-source]",
      `${detail.source||snapshot.source||"—"} · ${detail.transport||"shared"}${detail.stale?" · stale":""}`
    );

    set(
      root,
      "[data-nbc-meta]",
      "ZZXBitnodes v8 · verified city + region + nation geography · all matching rows continuously scrollable · no pagination"
    );

    renderReadout(root,state);
    status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");

    W.ZZXNodesByCity=Object.freeze({
      schema:"zzx-nodes-by-city-export-v4",
      rows:m.rows,
      networkTotal:m.reachable,
      decoded:m.decoded,
      cityCount:m.cityCount,
      nationCount:m.nationCount,
      geolocatedTotal:m.geolocatedTotal,
      unidentified:m.unidentified,
      coverage:m.coverage,
      geographySource:m.geographySource,
      geographyJoined:m.geographyJoined,
      updatedMs:Number.isFinite(updated)?updated:null,
      source:detail.source,
      transport:detail.transport
    });

    W.ZZXNodesByCityLatest=W.ZZXNodesByCity;
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const loaded=await W.ZZXNodesByCityProvider.load(force);
      state.detail=loaded.detail;
      state.model=loaded.model;
      render(root,state);
    }catch(error){
      status(root,state.detail?"stale":"offline",state.detail?"warn":"error");
      set(root,"[data-nbc-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxNodesByCityState;
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

    root.__zzxNodesByCityState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXNodesByCityViewport.attach(root);

      const sort=q(root,"[data-nbc-sort]");
      const savedSort=safeGet(SORT_KEY);

      if(
        sort &&
        ["nodes","city","region","nation","iso","share"].includes(savedSort)
      ){
        sort.value=savedSort;
      }

      q(root,"[data-nbc-search]")?.addEventListener(
        "input",
        ()=>{
          if(state.searchTimer){
            W.clearTimeout(state.searchTimer);
          }

          state.searchTimer=W.setTimeout(
            ()=>renderReadout(root,state,{resetScroll:true}),
            100
          );
        },
        options
      );

      sort?.addEventListener(
        "change",
        ()=>{
          safeSet(SORT_KEY,sortMode(root));
          renderReadout(root,state,{resetScroll:true});
        },
        options
      );

      q(root,"[data-nbc-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(
          detail=>{
            if(!detail?.snapshot||!root.isConnected)return;

            state.detail=detail;
            state.model=W.ZZXNodesByCityModel.build(detail.snapshot);
            render(root,state);
          },
          {immediate:false}
        );
      }

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-nbc-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
