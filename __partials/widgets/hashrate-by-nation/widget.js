// __partials/widgets/hashrate-by-nation/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="hashrate-by-nation";
  const SORT_KEY="zzx.widget.hashrate-by-nation.sort.v10.34";

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

  function pct(value){
    const n=finite(value);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function fmtEH(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";
    if(n>=1000)return `${(n/1000).toFixed(3)} ZH/s`;
    return `${n.toFixed(n>=100?1:2)} EH/s`;
  }

  function safeGet(key){
    try{return W.localStorage.getItem(key);}catch(_){return null;}
  }

  function safeSet(key,value){
    try{W.localStorage.setItem(key,String(value));}catch(_){}
  }

  function status(root,label,state){
    const el=q(root,"[data-hbn-status]");
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
      : "/__partials/widgets/hashrate-by-nation";
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
      script.dataset.hbnDependency=tag;
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
      `${base(core)}/js/model.js`,
      ()=>Number(W.ZZXHashrateNationModel?.__version||0)>=6,
      "ZZXHashrateNationModel"
    );

    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXHashrateNationProvider?.__version||0)>=6,
      "ZZXHashrateNationProvider"
    );

    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXHashrateNationUI?.__version||0)>=4,
      "ZZXHashrateNationUI"
    );

    await loadScript(
      `${base(core)}/js/charts.js`,
      ()=>Number(W.ZZXHashrateNationCharts?.__version||0)>=4,
      "ZZXHashrateNationCharts"
    );

    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXHashrateNationViewport?.__version||0)>=4,
      "ZZXHashrateNationViewport"
    );
  }

  function filtered(root,state){
    let rows=[...(state.model?.rows||[])];

    const needle=String(q(root,"[data-hbn-search]")?.value||"")
      .trim()
      .toLowerCase();

    if(needle){
      rows=rows.filter(row=>
        [
          row.country,
          row.countryName
        ].join(" ").toLowerCase().includes(needle)
      );
    }

    const sort=String(q(root,"[data-hbn-sort]")?.value||"hash-desc");

    switch(sort){
      case "share-desc":
        rows.sort((a,b)=>
          b.share-a.share ||
          a.countryName.localeCompare(b.countryName)
        );
        break;

      case "confidence-desc":
        rows.sort((a,b)=>
          b.confidence-a.confidence ||
          b.estimateEH-a.estimateEH
        );
        break;

      case "nation":
        rows.sort((a,b)=>
          a.countryName.localeCompare(b.countryName)
        );
        break;

      default:
        rows.sort((a,b)=>
          b.estimateEH-a.estimateEH ||
          a.countryName.localeCompare(b.countryName)
        );
    }

    return rows;
  }

  function renderTable(root,state,{resetScroll=false}={}){
    const rows=filtered(root,state);
    const total=state.model?.rows?.length||0;
    const body=q(root,"[data-hbn-body]");

    if(body){
      W.ZZXHashrateNationUI.renderRows(body,rows);
    }

    set(
      root,
      "[data-hbn-visible-count]",
      `${rows.length.toLocaleString()} visible / ${total.toLocaleString()} total`
    );

    if(resetScroll){
      const scroller=q(root,"[data-hbn-scroll]");
      if(scroller)scroller.scrollTop=0;
    }
  }

  function render(root,state){
    const m=state.model;
    const detail=state.detail;

    if(!m||!detail)return;

    set(root,"[data-hbn-global]",fmtEH(m.globalEH));
    set(root,"[data-hbn-window]","last 24 hours");
    set(root,"[data-hbn-nations]",m.rows.length.toLocaleString());
    set(root,"[data-hbn-confidence]",pct(m.confidence));
    const confidenceFill=q(root,"[data-hbn-confidence-fill]");
    if(confidenceFill){
      confidenceFill.style.width=`${Math.max(0,Math.min(100,(Number(m.confidence)||0)*100)).toFixed(1)}%`;
    }
    set(root,"[data-hbn-pool-coverage]",pct(m.pool.coverage));
    set(root,"[data-hbn-grid-coverage]",pct(Math.max(m.grid.coverage,m.capacity?.coverage||0)));

    const rankResult=W.ZZXHashrateNationCharts.renderRank(root,m.rows);
    const timeResult=W.ZZXHashrateNationCharts.renderTimeline(root,m);

    set(
      root,
      "[data-hbn-ranked-count]",
      `${rankResult.rows} shown / ${m.rows.length} estimated`
    );

    set(
      root,
      "[data-hbn-timeline-count]",
      `${timeResult.series} nations · ${timeResult.points} global samples`
    );

    const legend=q(root,"[data-hbn-legend]");
    if(legend){
      W.ZZXHashrateNationUI.renderLegend(legend,m.rows);
    }

    set(
      root,
      "[data-hbn-pool-evidence]",
      `${m.pool.mappedPools}/${m.pool.pools} pools mapped · ${pct(m.pool.coverage)} weighted block share`
    );

    set(
      root,
      "[data-hbn-grid-evidence]",
      `${m.grid.accepted} mining-power nations · ${m.capacity?.accepted||0} capacity-prior nations · ${pct(m.capacity?.coverage||0)} grid coverage`
    );

    set(
      root,
      "[data-hbn-node-evidence]",
      `${Math.round(m.nodes.located||0).toLocaleString()} located / ${Math.round(m.nodes.total||0).toLocaleString()} · ${pct(m.nodes.coverage)}`
    );

    set(root,"[data-hbn-model-mode]",m.mode);

    const sourceList=detail.sources||{};

    set(
      root,
      "[data-hbn-sub]",
      `nation model ${sourceList.estimates||"unavailable"} · pool geo ${sourceList.poolEvidence||"unavailable"} · mining grid ${sourceList.grid||"unavailable"} · power grid ${sourceList.powerGrid||"unavailable"} · nodes ${sourceList.nodes||"unavailable"} · uncertainty bands are heuristic model ranges, not statistical confidence intervals`
    );

    renderTable(root,state);

    status(
      root,
      detail.stale?"cached":"live",
      detail.stale?"warn":"ok"
    );

    W.ZZXHashrateByNationLatest=Object.freeze({
      schema:"zzx-hashrate-by-nation-export-v3",
      global24hEH:m.globalEH,
      rows:m.rows,
      confidence:m.confidence,
      directCoverage:m.direct?.coverage||0,
      poolCoverage:m.pool.coverage,
      gridCoverage:m.grid.coverage,
      capacityPriorCoverage:m.capacity?.coverage||0,
      nodeCoverage:m.nodes.coverage,
      effectiveWeights:m.effective,
      modelMode:m.mode,
      sources:detail.sources,
      stale:!!detail.stale
    });
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    state.controller?.abort?.();

    state.controller=
      typeof AbortController==="function"
        ? new AbortController()
        : null;

    try{
      const detail=await W.ZZXHashrateNationProvider.load({
        force,
        signal:state.controller?.signal||null
      });

      const model=W.ZZXHashrateNationModel.build(detail.inputs);

      state.detail=detail;
      state.model=model;

      render(root,state);
    }catch(error){
      if(error?.name==="AbortError")return;

      status(
        root,
        state.detail?"stale":"offline",
        state.detail?"warn":"error"
      );

      set(root,"[data-hbn-sub]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxHashrateNationState;
    old?.abortController?.abort?.();
    old?.controller?.abort?.();
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
      abortController,
      controller:null,
      detachViewport:null
    };

    root.__zzxHashrateNationState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXHashrateNationViewport.attach(root);

      const sort=q(root,"[data-hbn-sort]");
      const savedSort=safeGet(SORT_KEY);

      if(
        sort &&
        ["hash-desc","share-desc","confidence-desc","nation"].includes(savedSort)
      ){
        sort.value=savedSort;
      }

      q(root,"[data-hbn-search]")?.addEventListener(
        "input",
        ()=>{
          if(state.searchTimer){
            W.clearTimeout(state.searchTimer);
          }

          state.searchTimer=W.setTimeout(
            ()=>renderTable(root,state,{resetScroll:true}),
            100
          );
        },
        options
      );

      sort?.addEventListener(
        "change",
        ()=>{
          safeSet(SORT_KEY,sort.value);
          renderTable(root,state,{resetScroll:true});
        },
        options
      );

      q(root,"[data-hbn-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-hbn-sub]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
