(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="nodes-by-version";
  const PAGE_KEY="zzx.widget.nodes-by-version.page-size.v4";

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

  function safeGet(key){
    try{return W.localStorage.getItem(key)}
    catch(_){return null}
  }

  function safeSet(key,value){
    try{W.localStorage.setItem(key,String(value))}
    catch(_){}
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
      script.dataset.nbvDependency=tag;
      script.addEventListener("load",done,{once:true});
      script.addEventListener("error",fail,{once:true});
      (D.head||D.documentElement).appendChild(script);
    });

    if(!test()){
      throw new Error(`${path} did not register ${tag}`);
    }
  }

  async function ensureModules(core){
    await loadScript(
      "/__partials/widgets/_shared/zzx-bitnodes.js",
      ()=>Number(W.ZZXBitnodes?.__version||0)>=5,
      "ZZXBitnodes"
    );

    await loadScript(
      `${base(core)}/js/model.js`,
      ()=>Number(W.ZZXNodesByVersionModel?.__version||0)>=1,
      "ZZXNodesByVersionModel"
    );
  }

  function pageSize(root){
    const n=Number(q(root,"[data-nbv-page-size]")?.value);
    return [5,10,20,50].includes(n)?n:10;
  }

  function filtered(root,state){
    const needle=String(q(root,"[data-nbv-search]")?.value||"")
      .trim()
      .toLowerCase();

    if(!needle)return state.model?.rows||[];

    return (state.model?.rows||[]).filter(row=>
      [
        row.userAgent,
        row.family,
        row.version
      ].join(" ").toLowerCase().includes(needle)
    );
  }

  function renderTable(root,state){
    const rows=filtered(root,state);
    const size=pageSize(root);
    const pages=Math.max(1,Math.ceil(rows.length/size));

    state.page=Math.max(0,Math.min(state.page,pages-1));

    const body=q(root,"[data-nbv-body]");
    if(!body)return;

    body.replaceChildren();

    const slice=rows.slice(
      state.page*size,
      state.page*size+size
    );

    if(!slice.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-version__empty";
      empty.textContent="No user-agent/version rows match this filter.";
      body.appendChild(empty);
    }else{
      slice.forEach((item,index)=>{
        const row=D.createElement("div");
        row.className="nodes-by-version__row";
        row.setAttribute("role","row");
        row.dataset.family=item.family;

        const values=[
          String(state.page*size+index+1),
          item.userAgent,
          item.family,
          integer(item.count),
          pct(item.share)
        ];

        values.forEach((value,i)=>{
          const cell=D.createElement("div");
          cell.setAttribute("role","cell");
          if(i>=3)cell.classList.add("nodes-by-version__num");
          cell.textContent=value;

          if(i===1){
            cell.title=`${item.userAgent} · ${item.family} · version ${item.version}`;
          }

          row.appendChild(cell);
        });

        body.appendChild(row);
      });
    }

    set(
      root,
      "[data-nbv-page]",
      `Page ${state.page+1} / ${pages} · ${rows.length.toLocaleString()} row${rows.length===1?"":"s"}`
    );

    const prev=q(root,"[data-nbv-prev]");
    const next=q(root,"[data-nbv-next]");
    if(prev)prev.disabled=state.page<=0;
    if(next)next.disabled=state.page>=pages-1;
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
      `${Number.isFinite(coverage)?pct(coverage):"coverage unavailable"}`
    );

    set(root,"[data-nbv-version-count]",m.distinctAgents.toLocaleString());
    set(root,"[data-nbv-top-agent]",top?.userAgent||"—");
    set(root,"[data-nbv-top-share]",top?pct(top.share):"—");
    set(root,"[data-nbv-coverage]",Number.isFinite(coverage)?pct(coverage):"—");

    set(
      root,
      "[data-nbv-core]",
      `${integer(m.core)} · ${pct(m.coreShare)}`
    );

    set(
      root,
      "[data-nbv-knots]",
      `${integer(m.knots)} · ${pct(m.knotsShare)}`
    );

    set(
      root,
      "[data-nbv-other]",
      `${integer(m.other)} · ${pct(m.otherShare)}`
    );

    set(root,"[data-nbv-family-count]",m.distinctFamilies.toLocaleString());

    set(root,"[data-nbv-network-total]",integer(m.reachable));
    set(root,"[data-nbv-decoded]",integer(m.decoded));
    set(root,"[data-nbv-height]",integer(snapshot.latestHeight));

    const updated=finite(snapshot.updatedMs);
    set(
      root,
      "[data-nbv-updated]",
      Number.isFinite(updated)?new Date(updated).toLocaleString():"—"
    );

    set(
      root,
      "[data-nbv-source]",
      `${result.source||snapshot.source||"—"} · ${result.transport||"shared"}${result.stale?" · stale":""}`
    );

    set(
      root,
      "[data-nbv-meta]",
      "ZZXBitnodes v5 shared snapshot · exact user-agent strings retained · zero per-widget node API calls"
    );

    renderTable(root,state);

    status(
      root,
      result.stale?"cached":"live",
      result.stale?"warn":"ok"
    );

    W.ZZXNodesByVersion=Object.freeze({
      schema:"zzx-nodes-by-version-export-v1",
      rows:m.rows,
      families:m.families,
      totalObserved:m.totalObserved,
      reachable:m.reachable,
      decoded:m.decoded,
      core:m.core,
      knots:m.knots,
      other:m.other,
      source:result.source,
      transport:result.transport,
      updatedMs:updated
    });

    W.ZZXNodesByVersionLatest=W.ZZXNodesByVersion;
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXBitnodes.load(force);
      state.model=W.ZZXNodesByVersionModel.build(state.result.snapshot);
      state.page=0;
      render(root,state);
    }catch(error){
      status(
        root,
        state.result?"stale":"offline",
        state.result?"warn":"error"
      );

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

    root.__zzxNodesByVersionState=state;

    try{
      await ensureModules(state.core);

      const size=q(root,"[data-nbv-page-size]");
      const savedSize=Number(safeGet(PAGE_KEY));
      if(size&&[5,10,20,50].includes(savedSize)){
        size.value=String(savedSize);
      }

      q(root,"[data-nbv-prev]")?.addEventListener(
        "click",
        ()=>{
          state.page=Math.max(0,state.page-1);
          renderTable(root,state);
        },
        options
      );

      q(root,"[data-nbv-next]")?.addEventListener(
        "click",
        ()=>{
          state.page+=1;
          renderTable(root,state);
        },
        options
      );

      q(root,"[data-nbv-search]")?.addEventListener(
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

      q(root,"[data-nbv-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state,true),
        options
      );

      state.unsubscribe=W.ZZXBitnodes.subscribe(
        detail=>{
          if(!detail?.snapshot||!root.isConnected)return;
          state.result=detail;
          state.model=W.ZZXNodesByVersionModel.build(detail.snapshot);
          render(root,state);
        },
        {immediate:false}
      );

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
