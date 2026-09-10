// __partials/widgets/nodes-by-city/widget.js
(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="nodes-by-city";
  const PAGE_KEY="zzx.widget.nodes-by-city.page-size.v7";

  function q(root,selector){return root?.querySelector?.(selector)||null;}
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
      script.addEventListener("error",()=>fail(new Error(`Failed to load ${path}`)),{once:true});
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
      ()=>Number(W.ZZXNodesByCityModel?.__version||0)>=7,
      "ZZXNodesByCityModel"
    );
    await loadScript(
      `${base(core)}/js/provider.js`,
      ()=>Number(W.ZZXNodesByCityProvider?.__version||0)>=7,
      "ZZXNodesByCityProvider"
    );
  }

  function pageSize(root){
    const n=Number(q(root,"[data-nbc-page-size]")?.value);
    return [5,10,20,50].includes(n)?n:10;
  }

  function filtered(root,state){
    const needle=String(q(root,"[data-nbc-search]")?.value||"")
      .trim()
      .toLowerCase();

    if(!needle)return state.model?.rows||[];

    return (state.model?.rows||[]).filter(row=>
      [
        row.city,
        row.region,
        row.country,
        row.countryName,
        row.label
      ].join(" ").toLowerCase().includes(needle)
    );
  }

  function cityCell(item){
    const wrap=D.createElement("div");
    wrap.className="nodes-by-city__city";

    const city=D.createElement("span");
    city.className="nodes-by-city__city-name";
    city.textContent=item.city||"Unknown";

    wrap.appendChild(city);

    if(item.region){
      const region=D.createElement("span");
      region.className="nodes-by-city__region";
      region.textContent=`· ${item.region}`;
      wrap.appendChild(region);
    }

    wrap.title=item.label||item.city||"Unknown";
    return wrap;
  }

  function nationCell(item){
    const wrap=D.createElement("div");
    wrap.className="nodes-by-city__nation";

    const flag=D.createElement("span");
    flag.className="nodes-by-city__flag";
    flag.textContent=item.flag||"—";
    flag.setAttribute("aria-hidden","true");

    const iso=D.createElement("span");
    iso.className="nodes-by-city__iso";
    iso.textContent=item.country||"--";

    const name=D.createElement("span");
    name.className="nodes-by-city__nation-name";
    name.textContent=item.countryName||"Unknown";

    wrap.append(flag,iso,name);
    wrap.title=item.country
      ? `${item.country} · ${item.countryName||item.country}`
      : "Nation unavailable";
    return wrap;
  }

  function renderTable(root,state){
    const rows=filtered(root,state);
    const size=pageSize(root);
    const pages=Math.max(1,Math.ceil(rows.length/size));
    state.page=Math.max(0,Math.min(state.page,pages-1));

    const body=q(root,"[data-nbc-body]");
    if(!body)return;
    body.replaceChildren();

    const slice=rows.slice(state.page*size,state.page*size+size);

    if(!slice.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-city__empty";
      empty.textContent="No city records match this filter.";
      body.appendChild(empty);
    }else{
      slice.forEach((item,index)=>{
        const row=D.createElement("div");
        row.className="nodes-by-city__row";
        row.setAttribute("role","row");

        const rank=D.createElement("div");
        rank.setAttribute("role","cell");
        rank.textContent=String(state.page*size+index+1);

        const city=D.createElement("div");
        city.setAttribute("role","cell");
        city.appendChild(cityCell(item));

        const nation=D.createElement("div");
        nation.setAttribute("role","cell");
        nation.appendChild(nationCell(item));

        const nodes=D.createElement("div");
        nodes.className="nodes-by-city__num";
        nodes.setAttribute("role","cell");
        nodes.textContent=integer(item.nodes);

        const share=D.createElement("div");
        share.className="nodes-by-city__num";
        share.setAttribute("role","cell");
        share.textContent=pct(item.share);

        const geoShare=D.createElement("div");
        geoShare.className="nodes-by-city__num";
        geoShare.setAttribute("role","cell");
        geoShare.textContent=pct(item.geoShare);

        row.append(rank,city,nation,nodes,share,geoShare);
        body.appendChild(row);
      });
    }

    set(
      root,
      "[data-nbc-page]",
      `Page ${state.page+1} / ${pages} · ${rows.length.toLocaleString()} cit${rows.length===1?"y":"ies"}`
    );

    const prev=q(root,"[data-nbc-prev]");
    const next=q(root,"[data-nbc-next]");
    if(prev)prev.disabled=state.page<=0;
    if(next)next.disabled=state.page>=pages-1;
  }

  function render(root,state){
    const result=state.result;
    const snapshot=result?.snapshot;
    const m=state.model;
    if(!snapshot||!m)return;

    set(root,"[data-nbc-summary]",`${integer(m.geolocatedTotal)} nodes`);
    set(
      root,
      "[data-nbc-sub]",
      `${m.cityCount.toLocaleString()} distinct city/region/nation row${m.cityCount===1?"":"s"} · ${
        Number.isFinite(finite(m.coverage))?pct(m.coverage):"coverage unavailable"
      } reachable coverage`
    );
    set(root,"[data-nbc-city-count]",m.cityCount.toLocaleString());
    set(
      root,
      "[data-nbc-top-city]",
      m.top
        ? `${m.top.flag} ${m.top.city}${m.top.region?` · ${m.top.region}`:""} · ${m.top.countryName}`
        : "—"
    );
    set(root,"[data-nbc-top-share]",m.top?pct(m.top.share):"—");
    set(root,"[data-nbc-coverage]",pct(m.coverage));

    width(q(root,"[data-nbc-bar-known]"),m.coverage);
    width(
      q(root,"[data-nbc-bar-unknown]"),
      Number.isFinite(finite(m.coverage))?1-m.coverage:NaN
    );

    set(root,"[data-nbc-known]",`${integer(m.geolocatedTotal)} · ${pct(m.coverage)}`);
    set(
      root,
      "[data-nbc-unknown]",
      Number.isFinite(finite(m.unidentified))
        ? `${integer(m.unidentified)} · ${pct(m.denominator>0?m.unidentified/m.denominator:NaN)}`
        : "—"
    );
    set(root,"[data-nbc-network-total]",integer(m.reachable));
    set(root,"[data-nbc-decoded]",integer(m.decoded));
    set(root,"[data-nbc-unlocated]",integer(m.unidentified));

    const updated=finite(
      snapshot.updatedMs ??
      snapshot.generatedAtMs ??
      snapshot.timestampMs ??
      snapshot.generated_at ??
      snapshot.updated_at ??
      snapshot.timestamp
    );
    const updatedMs=Number.isFinite(updated)&&updated>0&&updated<2e12?updated*1000:updated;

    set(
      root,
      "[data-nbc-updated]",
      Number.isFinite(updatedMs)?new Date(updatedMs).toLocaleString():"—"
    );
    set(
      root,
      "[data-nbc-source]",
      `${result.source||snapshot.source||"shared ZZX Bitnodes"} · ${result.transport||"shared"}${result.stale?" · stale":""}`
    );
    set(
      root,
      "[data-nbc-meta]",
      `${m.mode==="per-node"?"per-node canonical city geography":"aggregate city distribution"} · city + region + flag + ISO-2 + full nation`
    );

    renderTable(root,state);
    status(root,result.stale?"cached":"live",result.stale?"warn":"ok");

    const rows=m.rows.map(row=>Object.freeze({
      city:row.city,
      region:row.region,
      country:row.country,
      countryName:row.countryName,
      flag:row.flag,
      label:row.label,
      nodes:row.nodes,
      share:row.share,
      geoShare:row.geoShare
    }));

    W.ZZXNodesByCity=Object.freeze({
      schema:"zzx-nodes-by-city-export-v7",
      mode:m.mode,
      rows:Object.freeze(rows),
      networkTotal:m.reachable,
      decoded:m.decoded,
      geolocatedTotal:m.geolocatedTotal,
      unidentified:m.unidentified,
      coverage:m.coverage,
      updatedMs:Number.isFinite(updatedMs)?updatedMs:null,
      source:result.source,
      transport:result.transport
    });
    W.ZZXNodesByCityLatest=W.ZZXNodesByCity;
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const loaded=await W.ZZXNodesByCityProvider.load(force);
      state.result=loaded.result;
      state.model=loaded.model;
      state.page=0;
      render(root,state);
    }catch(error){
      status(root,state.result?"stale":"offline",state.result?"warn":"error");
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
    if(old?.searchTimer)W.clearTimeout(old.searchTimer);

    const abortController=typeof AbortController==="function"?new AbortController():null;
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
    root.__zzxNodesByCityState=state;

    try{
      await ensureModules(state.core);

      const size=q(root,"[data-nbc-page-size]");
      const saved=Number(safeGet(PAGE_KEY));
      if(size&&[5,10,20,50].includes(saved))size.value=String(saved);

      q(root,"[data-nbc-prev]")?.addEventListener("click",()=>{
        state.page=Math.max(0,state.page-1);
        renderTable(root,state);
      },options);

      q(root,"[data-nbc-next]")?.addEventListener("click",()=>{
        state.page+=1;
        renderTable(root,state);
      },options);

      q(root,"[data-nbc-search]")?.addEventListener("input",()=>{
        if(state.searchTimer)W.clearTimeout(state.searchTimer);
        state.searchTimer=W.setTimeout(()=>{
          state.page=0;
          renderTable(root,state);
        },120);
      },options);

      size?.addEventListener("change",()=>{
        safeSet(PAGE_KEY,pageSize(root));
        state.page=0;
        renderTable(root,state);
      },options);

      q(root,"[data-nbc-refresh]")?.addEventListener("click",()=>{
        refresh(root,state,true);
      },options);

      if(typeof W.ZZXBitnodes?.subscribe==="function"){
        state.unsubscribe=W.ZZXBitnodes.subscribe(detail=>{
          if(!detail?.snapshot||!root.isConnected)return;
          state.result=detail;
          state.model=W.ZZXNodesByCityModel.build(detail.snapshot);
          render(root,state);
        },{immediate:false});
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
