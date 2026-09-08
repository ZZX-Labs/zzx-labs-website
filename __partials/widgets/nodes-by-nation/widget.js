(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="nodes-by-nation";
  const PAGE_KEY="zzx.widget.nodes-by-nation.page-size.v5";

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
    try{return W.localStorage.getItem(key)}
    catch(_){return null}
  }

  function safeSet(key,value){
    try{W.localStorage.setItem(key,String(value))}
    catch(_){}
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
      while(!test()&&Date.now()-started<1800){
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
      script.addEventListener("error",fail,{once:true});
      (D.head||D.documentElement).appendChild(script);
    });

    if(!test())throw new Error(`${path} did not register ${tag}`);
  }

  async function ensureModules(core){
    await loadScript(
      "/__partials/widgets/_shared/zzx-bitnodes.js",
      ()=>Number(W.ZZXBitnodes?.__version||0)>=5,
      "ZZXBitnodes"
    );

    await loadScript(
      `${base(core)}/js/model.js`,
      ()=>Number(W.ZZXNodesByNationModel?.__version||0)>=1,
      "ZZXNodesByNationModel"
    );
  }

  function pageSize(root){
    const n=Number(q(root,"[data-nbn-page-size]")?.value);
    return [5,10,20,50].includes(n)?n:10;
  }

  function filtered(root,state){
    const needle=String(q(root,"[data-nbn-search]")?.value||"")
      .trim()
      .toLowerCase();

    if(!needle)return state.model?.rows||[];

    return (state.model?.rows||[]).filter(item=>
      `${item.code} ${item.name}`.toLowerCase().includes(needle)
    );
  }

  function nationCell(item){
    const wrap=D.createElement("div");
    wrap.className="nodes-by-nation__nation";

    const iso=D.createElement("span");
    iso.className="nodes-by-nation__iso";
    iso.textContent=item.code||"--";

    const name=D.createElement("span");
    name.className="nodes-by-nation__name";
    name.textContent=item.name||item.code||"Unknown";
    name.title=name.textContent;

    wrap.append(iso,name);
    return wrap;
  }

  function renderTable(root,state){
    const rows=filtered(root,state);
    const size=pageSize(root);
    const pages=Math.max(1,Math.ceil(rows.length/size));

    state.page=Math.max(0,Math.min(state.page,pages-1));

    const body=q(root,"[data-nbn-body]");
    if(!body)return;
    body.replaceChildren();

    const slice=rows.slice(
      state.page*size,
      state.page*size+size
    );

    if(!slice.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-nation__empty";
      empty.textContent="No nation records match this filter.";
      body.appendChild(empty);
    }else{
      slice.forEach((item,index)=>{
        const row=D.createElement("div");
        row.className="nodes-by-nation__row";
        row.setAttribute("role","row");

        const rank=D.createElement("div");
        rank.setAttribute("role","cell");
        rank.textContent=String(state.page*size+index+1);

        const nation=D.createElement("div");
        nation.setAttribute("role","cell");
        nation.appendChild(nationCell(item));

        const nodes=D.createElement("div");
        nodes.className="nodes-by-nation__num";
        nodes.setAttribute("role","cell");
        nodes.textContent=integer(item.nodes);

        const share=D.createElement("div");
        share.className="nodes-by-nation__num";
        share.setAttribute("role","cell");
        share.textContent=pct(item.share);

        const geoShare=D.createElement("div");
        geoShare.className="nodes-by-nation__num";
        geoShare.setAttribute("role","cell");
        geoShare.textContent=pct(item.geoShare);

        row.append(rank,nation,nodes,share,geoShare);
        body.appendChild(row);
      });
    }

    set(
      root,
      "[data-nbn-page]",
      `Page ${state.page+1} / ${pages} · ${rows.length.toLocaleString()} nation${rows.length===1?"":"s"}`
    );

    const prev=q(root,"[data-nbn-prev]");
    const next=q(root,"[data-nbn-next]");
    if(prev)prev.disabled=state.page<=0;
    if(next)next.disabled=state.page>=pages-1;
  }

  function render(root,state){
    const result=state.result;
    const snapshot=result?.snapshot;
    const m=state.model;

    if(!snapshot||!m)return;

    set(root,"[data-nbn-summary]",`${integer(m.geolocatedTotal)} nodes`);

    set(
      root,
      "[data-nbn-sub]",
      `${m.nationCount.toLocaleString()} nation${m.nationCount===1?"":"s"} · `+
      `${Number.isFinite(finite(m.coverage))?pct(m.coverage):"coverage unavailable"} of reachable-node population`
    );

    set(root,"[data-nbn-country-count]",m.nationCount.toLocaleString());

    set(
      root,
      "[data-nbn-top-country]",
      m.top?`${m.top.code} · ${m.top.name}`:"—"
    );

    set(
      root,
      "[data-nbn-top-share]",
      m.top?pct(m.top.share):"—"
    );

    set(root,"[data-nbn-coverage]",pct(m.coverage));

    width(q(root,"[data-nbn-bar-known]"),m.coverage);
    width(
      q(root,"[data-nbn-bar-unknown]"),
      Number.isFinite(finite(m.coverage))
        ? 1-m.coverage
        : NaN
    );

    set(
      root,
      "[data-nbn-known]",
      `${integer(m.geolocatedTotal)} · ${pct(m.coverage)}`
    );

    set(
      root,
      "[data-nbn-unknown]",
      Number.isFinite(finite(m.unidentified))
        ? `${integer(m.unidentified)} · ${pct(m.denominator>0?m.unidentified/m.denominator:NaN)}`
        : "—"
    );

    set(root,"[data-nbn-network-total]",integer(m.reachable));
    set(root,"[data-nbn-decoded]",integer(m.decoded));
    set(root,"[data-nbn-unlocated]",integer(m.unidentified));

    const updated=finite(snapshot.updatedMs);
    set(
      root,
      "[data-nbn-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );

    set(
      root,
      "[data-nbn-source]",
      `${result.source||snapshot.source||"—"} · ${result.transport||"shared"}${result.stale?" · stale":""}`
    );

    set(
      root,
      "[data-nbn-meta]",
      "ZZXBitnodes v5 shared snapshot · byNation/normalized node geography · zero per-widget node API calls"
    );

    renderTable(root,state);

    status(
      root,
      result.stale?"cached":"live",
      result.stale?"warn":"ok"
    );

    const exportRows=m.rows.map(row=>Object.freeze({
      code:row.code,
      name:row.name,
      nodes:row.nodes,
      share:row.share,
      geoShare:row.geoShare
    }));

    W.ZZXNodesByNation=Object.freeze({
      schema:"zzx-nodes-by-nation-export-v1",
      rows:Object.freeze(exportRows),
      byNation:Object.freeze(
        Object.fromEntries(exportRows.map(row=>[
          row.code,
          Object.freeze({
            country:row.name,
            code:row.code,
            nodes:row.nodes,
            share:row.share,
            geoShare:row.geoShare
          })
        ]))
      ),
      networkTotal:m.reachable,
      decoded:m.decoded,
      geolocatedTotal:m.geolocatedTotal,
      unidentified:m.unidentified,
      coverage:m.coverage,
      updatedMs:updated,
      source:result.source,
      transport:result.transport
    });

    W.ZZXNodesByNationLatest=W.ZZXNodesByNation;
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXBitnodes.load(force);
      state.model=W.ZZXNodesByNationModel.build(state.result.snapshot);
      state.page=0;
      render(root,state);
    }catch(error){
      status(
        root,
        state.result?"stale":"offline",
        state.result?"warn":"error"
      );

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
    if(old?.searchTimer)W.clearTimeout(old.searchTimer);

    const abortController=typeof AbortController==="function"
      ? new AbortController()
      : null;
    const options=abortController?{signal:abortController.signal}:undefined;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      result:null,
      model:null,
      page:0,
      busy:false,
      searchTimer:null,
      unsubscribe:null,
      abortController
    };

    root.__zzxNodesByNationState=state;

    try{
      await ensureModules(state.core);

      const size=q(root,"[data-nbn-page-size]");
      const savedSize=Number(safeGet(PAGE_KEY));

      if(size&&[5,10,20,50].includes(savedSize)){
        size.value=String(savedSize);
      }

      q(root,"[data-nbn-prev]")?.addEventListener(
        "click",
        ()=>{
          state.page=Math.max(0,state.page-1);
          renderTable(root,state);
        },
        options
      );

      q(root,"[data-nbn-next]")?.addEventListener(
        "click",
        ()=>{
          state.page+=1;
          renderTable(root,state);
        },
        options
      );

      q(root,"[data-nbn-search]")?.addEventListener(
        "input",
        ()=>{
          if(state.searchTimer)W.clearTimeout(state.searchTimer);
          state.searchTimer=W.setTimeout(()=>{
            state.page=0;
            renderTable(root,state);
          },120);
        },
        options
      );

      size?.addEventListener(
        "change",
        ()=>{
          safeSet(PAGE_KEY,pageSize(root));
          state.page=0;
          renderTable(root,state);
        },
        options
      );

      q(root,"[data-nbn-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      state.unsubscribe=W.ZZXBitnodes.subscribe(
        detail=>{
          if(!detail?.snapshot||!root.isConnected)return;
          state.result=detail;
          state.model=W.ZZXNodesByNationModel.build(detail.snapshot);
          render(root,state);
        },
        {immediate:false}
      );

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
