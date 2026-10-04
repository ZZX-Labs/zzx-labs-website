// __partials/widgets/nodes-by-nation/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="nodes-by-nation";
  const SORT_KEY="zzx.widget.nodes-by-nation.sort.v10.27";

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
    const el=q(root,"[data-nbn-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }
  function base(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/nodes-by-nation";
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
      script.dataset.nbnDependency=tag;
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
      ()=>Number(W.ZZXNodesByNationModel?.__version||0)>=4,
      "ZZXNodesByNationModel"
    );
    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXNodesByNationProvider?.__version||0)>=4,
      "ZZXNodesByNationProvider"
    );
    await loadScript(
      `${base(core)}/js/ui.js`,
      ()=>Number(W.ZZXNodesByNationUI?.__version||0)>=4,
      "ZZXNodesByNationUI"
    );
    await loadScript(
      `${base(core)}/js/viewport.js`,
      ()=>Number(W.ZZXNodesByNationViewport?.__version||0)>=4,
      "ZZXNodesByNationViewport"
    );
  }

  function sortMode(root){
    return String(q(root,"[data-nbn-sort]")?.value||"nodes");
  }

  function filtered(root,state){
    let rows=[...(state.model?.rows||[])];

    const needle=String(q(root,"[data-nbn-search]")?.value||"")
      .trim()
      .toLowerCase();

    if(needle){
      rows=rows.filter(item=>
        [
          item.flag,
          item.code,
          item.name,
          item.label
        ].join(" ").toLowerCase().includes(needle)
      );
    }

    switch(sortMode(root)){
      case "nation":
        rows.sort((a,b)=>
          a.name.localeCompare(b.name) ||
          a.code.localeCompare(b.code)
        );
        break;
      case "iso":
        rows.sort((a,b)=>
          a.code.localeCompare(b.code) ||
          a.name.localeCompare(b.name)
        );
        break;
      case "share":
        rows.sort((a,b)=>
          b.geoShare-a.geoShare ||
          b.nodes-a.nodes ||
          a.name.localeCompare(b.name)
        );
        break;
      default:
        rows.sort((a,b)=>
          b.nodes-a.nodes ||
          a.name.localeCompare(b.name) ||
          a.code.localeCompare(b.code)
        );
    }

    return rows;
  }

  function renderReadout(root,state,{resetScroll=false}={}){
    const rows=filtered(root,state);
    const body=q(root,"[data-nbn-body]");

    if(body){
      W.ZZXNodesByNationUI.renderRows(body,rows);
    }

    set(
      root,
      "[data-nbn-visible-count]",
      `${rows.length.toLocaleString()} visible / ${(state.model?.nationCount||0).toLocaleString()} total`
    );

    if(resetScroll){
      const scroller=q(root,"[data-nbn-scroll]");
      if(scroller)scroller.scrollTop=0;
    }
  }

  function render(root,state){
    const detail=state.detail;
    const snapshot=detail?.snapshot;
    const m=state.model;

    if(!snapshot||!m)return;

    set(root,"[data-nbn-summary]",`${integer(m.geolocatedTotal)} nodes`);
    set(
      root,
      "[data-nbn-sub]",
      `${m.nationCount.toLocaleString()} nation${m.nationCount===1?"":"s"} · ${pct(m.coverage)} reachable-node coverage · ${m.mode}`
    );

    set(root,"[data-nbn-country-count]",m.nationCount.toLocaleString());
    set(
      root,
      "[data-nbn-top-country]",
      m.top?`${m.top.flag||"🏴"} ${m.top.name} · ${m.top.code}`:"—"
    );
    set(root,"[data-nbn-top-share]",m.top?pct(m.top.share):"—");
    set(root,"[data-nbn-coverage]",pct(m.coverage));

    set(
      root,
      "[data-nbn-coverage-label]",
      `${integer(m.geolocatedTotal)} / ${integer(m.denominator)} geolocated`
    );

    width(q(root,"[data-nbn-bar-known]"),m.coverage);
    width(
      q(root,"[data-nbn-bar-unknown]"),
      Number.isFinite(finite(m.coverage))?1-m.coverage:1
    );

    set(
      root,
      "[data-nbn-known]",
      `${integer(m.geolocatedTotal)} · ${pct(m.coverage)}`
    );
    set(
      root,
      "[data-nbn-unknown]",
      `${integer(m.unidentified)} · ${pct(m.denominator>0?m.unidentified/m.denominator:NaN)}`
    );
    set(root,"[data-nbn-geo-joins]",integer(m.geographyJoined));

    const leaders=q(root,"[data-nbn-leaders]");
    if(leaders){
      W.ZZXNodesByNationUI.renderLeaders(leaders,m.rows);
    }
    set(
      root,
      "[data-nbn-leader-count]",
      `${Math.min(5,m.nationCount)} of ${m.nationCount.toLocaleString()}`
    );

    set(root,"[data-nbn-network-total]",integer(m.reachable??m.denominator));
    set(root,"[data-nbn-decoded]",integer(m.decoded));
    set(root,"[data-nbn-unlocated]",integer(m.unidentified));
    set(root,"[data-nbn-geo-source]",m.geographySource||"unavailable");

    const updated=finite(snapshot.updatedMs);

    set(
      root,
      "[data-nbn-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );

    set(
      root,
      "[data-nbn-source]",
      `${detail.source||snapshot.source||"—"} · ${detail.transport||"shared"}${detail.stale?" · stale":""}`
    );

    set(
      root,
      "[data-nbn-meta]",
      "ZZXBitnodes v8 · verified Map Host nation enrichment · full scrollable nation readout · no pagination"
    );

    renderReadout(root,state);
    status(root,detail.stale?"cached":"live",detail.stale?"warn":"ok");

    const exportRows=m.rows.map(row=>Object.freeze({
      code:row.code,
      name:row.name,
      flag:row.flag,
      label:row.label,
      nodes:row.nodes,
      share:row.share,
      geoShare:row.geoShare
    }));

    W.ZZXNodesByNation=Object.freeze({
      schema:"zzx-nodes-by-nation-export-v4",
      rows:Object.freeze(exportRows),
      byNation:Object.freeze(
        Object.fromEntries(
          exportRows.map(row=>[
            row.code,
            Object.freeze({
              country:row.name,
              code:row.code,
              flag:row.flag,
              nodes:row.nodes,
              share:row.share,
              geoShare:row.geoShare
            })
          ])
        )
      ),
      networkTotal:m.reachable,
      decoded:m.decoded,
      geolocatedTotal:m.geolocatedTotal,
      unidentified:m.unidentified,
      coverage:m.coverage,
      geographySource:m.geographySource,
      geographyJoined:m.geographyJoined,
      updatedMs:Number.isFinite(updated)?updated:null,
      source:detail.source,
      transport:detail.transport
    });

    W.ZZXNodesByNationLatest=W.ZZXNodesByNation;
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const loaded=await W.ZZXNodesByNationProvider.load(force);
      state.detail=loaded.detail;
      state.model=loaded.model;
      render(root,state);
    }catch(error){
      status(root,state.detail?"stale":"offline",state.detail?"warn":"error");
      set(root,"[data-nbn-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const old=root.__zzxNodesByNationState;
    old?.unsubscribe?.();
    old?.abortController?.abort?.();
    old?.detachViewport?.();
    if(old?.searchTimer)W.clearTimeout(old.searchTimer);

    const abortController=typeof AbortController==="function"
      ? new AbortController()
      : null;
    const options=abortController?{signal:abortController.signal}:undefined;

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

    root.__zzxNodesByNationState=state;

    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXNodesByNationViewport.attach(root);

      const sort=q(root,"[data-nbn-sort]");
      const savedSort=safeGet(SORT_KEY);

      if(sort&&["nodes","nation","iso","share"].includes(savedSort)){
        sort.value=savedSort;
      }

      q(root,"[data-nbn-search]")?.addEventListener(
        "input",
        ()=>{
          if(state.searchTimer)W.clearTimeout(state.searchTimer);
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

      q(root,"[data-nbn-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(
          detail=>{
            if(!detail?.snapshot||!root.isConnected)return;

            state.detail=detail;
            state.model=W.ZZXNodesByNationModel.build(detail.snapshot);
            render(root,state);
          },
          {immediate:false}
        );
      }

      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-nbn-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
