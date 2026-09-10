(function(){
  "use strict";
  const W=window,D=document,ID="knots-vs-core";

  function q(root,sel){return root?.querySelector?.(sel)||null}
  function set(root,sel,v){const el=q(root,sel);if(el)el.textContent=v==null?"—":String(v)}
  function finite(v){const n=Number(v);return Number.isFinite(n)?n:NaN}
  function int(v){const n=finite(v);return Number.isFinite(n)?Math.round(n).toLocaleString():"—"}
  function pct(v){const n=finite(v);return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—"}
  function width(el,fraction){if(!el)return;const n=finite(fraction);el.style.width=Number.isFinite(n)?`${Math.max(0,Math.min(100,n*100)).toFixed(2)}%`:"0%"}
  function status(root,label,state){const el=q(root,"[data-kvc-status]");if(!el)return;el.textContent=label;el.setAttribute("data-status",state||"offline")}
  function resolve(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path}
  function base(core){return core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/knots-vs-core"}

  async function loadScript(path,test,tag){
    if(test())return;
    const src=new URL(resolve(path),W.location.href).href;
    const existing=[...D.scripts].find(s=>s.src===src);
    if(existing){
      const started=Date.now();
      while(!test()&&Date.now()-started<1800)await new Promise(done=>W.setTimeout(done,25));
      if(test())return;
    }
    await new Promise((done,fail)=>{
      const s=D.createElement("script");s.src=src;s.defer=true;s.dataset.kvcDependency=tag;
      s.addEventListener("load",done,{once:true});s.addEventListener("error",fail,{once:true});
      (D.head||D.documentElement).appendChild(s);
    });
    if(!test())throw new Error(`${path} did not register ${tag}`);
  }

  async function ensureModules(core){
    await loadScript("/__partials/widgets/_shared/zzx-bitnodes.js",()=>Number(W.ZZXBitnodes?.__version||0)>=8,"ZZXBitnodes");
    await loadScript("/__partials/widgets/nodes-by-version/js/model.js",()=>Number(W.ZZXNodesByVersionModel?.__version||0)>=2,"ZZXNodesByVersionModel");
    await loadScript(`${base(core)}/js/model.js`,()=>Number(W.ZZXKnotsCoreModel?.__version||0)>=5,"ZZXKnotsCoreModel");
    await loadScript(`${base(core)}/js/provider.js`,()=>Number(W.ZZXKnotsCoreProvider?.__version||0)>=5,"ZZXKnotsCoreProvider");
    await loadScript(`${base(core)}/js/ui.js`,()=>Number(W.ZZXKnotsCoreUI?.__version||0)>=6,"ZZXKnotsCoreUI");
    await loadScript(`${base(core)}/js/viewport.js`,()=>Number(W.ZZXKnotsCoreViewport?.__version||0)>=6,"ZZXKnotsCoreViewport");
  }

  function filteredVersionRows(root,state){
    const needle=String(q(root,"[data-kvc-search]")?.value||"").trim().toLowerCase();
    const client=String(q(root,"[data-kvc-client]")?.value||"all");
    const sort=String(q(root,"[data-kvc-sort]")?.value||"count-desc");
    let rows=[...(state.result?.model?.exactRows||[])];
    if(client!=="all")rows=rows.filter(row=>row.family===client);
    if(needle)rows=rows.filter(row=>`${row.family} ${row.version} ${row.userAgent} ${row.country} ${row.countryName} ${row.flag}`.toLowerCase().includes(needle));
    if(sort==="client-version")rows.sort((a,b)=>a.family.localeCompare(b.family)||String(a.version).localeCompare(String(b.version),undefined,{numeric:true})||a.userAgent.localeCompare(b.userAgent));
    else if(sort==="share-desc")rows.sort((a,b)=>(b.shareIdentified||0)-(a.shareIdentified||0)||b.count-a.count);
    else rows.sort((a,b)=>b.count-a.count||a.userAgent.localeCompare(b.userAgent));
    return rows;
  }

  function renderNations(root,state){
    const rows=state.result?.model?.nationRows||[];
    set(
      root,
      "[data-kvc-nation-count]",
      `${rows.length.toLocaleString()} nation${rows.length===1?"":"s"}`
    );

    const body=q(root,"[data-kvc-nation-body]");
    if(!body)return;

    W.ZZXKnotsCoreUI.renderNationRows(body,rows);
  }

  function renderVersions(root,state){
    const rows=filteredVersionRows(root,state);

    set(
      root,
      "[data-kvc-version-count]",
      `${rows.length.toLocaleString()} matching version${rows.length===1?"":"s"}`
    );

    const body=q(root,"[data-kvc-version-body]");
    if(!body)return;

    W.ZZXKnotsCoreUI.renderVersionRows(body,rows);
  }

  function render(root,state){
    const r=state.result,m=r.model;
    set(root,"[data-kvc-summary]",`Core ${pct(m.coreVsKnots)} · Knots ${pct(m.knotsVsCore)}`);
    set(root,"[data-kvc-sub]",`Core-vs-Knots uses only explicit Core + Knots UAs · ${int(m.identified)} identified of ${int(m.total)} reachable`);
    set(root,"[data-kvc-total-reach]",int(m.total));set(root,"[data-kvc-core-reach]",int(m.core));set(root,"[data-kvc-knots-reach]",int(m.knots));set(root,"[data-kvc-other-reach]",int(m.other));
    set(root,"[data-kvc-core-pct]",pct(m.corePct));set(root,"[data-kvc-knots-pct]",pct(m.knotsPct));set(root,"[data-kvc-other-pct]",pct(m.otherPct));set(root,"[data-kvc-coverage]",`${pct(m.coverage)} identified`);
    width(q(root,"[data-kvc-bar-core]"),m.corePct);width(q(root,"[data-kvc-bar-knots]"),m.knotsPct);width(q(root,"[data-kvc-bar-other]"),m.otherPct);
    set(root,"[data-kvc-core-row]",int(m.core));set(root,"[data-kvc-knots-row]",int(m.knots));set(root,"[data-kvc-other-row]",int(m.other));
    set(root,"[data-kvc-core-tor]",int(m.torCore));set(root,"[data-kvc-knots-tor]",int(m.torKnots));set(root,"[data-kvc-other-tor]",int(m.torOther));
    set(root,"[data-kvc-core-row-pct]",pct(m.corePct));set(root,"[data-kvc-knots-row-pct]",pct(m.knotsPct));set(root,"[data-kvc-other-row-pct]",pct(m.otherPct));
    set(root,"[data-kvc-identification]",`${int(m.identified)} / ${int(m.total)} · ${pct(m.coverage)} · ${int(m.unidentifiedReachable)} reachable without decoded UA`);
    set(root,"[data-kvc-unreachable]",Number.isFinite(m.unreachable)?`${int(m.unreachable)} network-wide · not attributed to client`:"not supplied by current snapshot");
    set(root,"[data-kvc-generated]",r.generated?new Date(r.generated).toLocaleString():"—");
    set(root,"[data-kvc-source]",`${r.source} · ${r.transport}${r.stale?" · stale":""}`);
    set(root,"[data-kvc-note]","shared ZZXBitnodes v8 · scrollable nation + exact-version matrices · exact UA classification · verified Map Host geography");
    renderNations(root,state);
    renderVersions(root,state);
    status(root,r.stale?"cached":"live",r.stale?"warn":"ok");
    W.ZZXKnotsVsCoreLatest=Object.freeze({schema:"zzx-knots-vs-core-export-v2",...m,source:r.source,transport:r.transport,generated:r.generated});
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{state.result=await W.ZZXKnotsCoreProvider.load(force);render(root,state)}catch(error){status(root,state.result?"stale":"offline",state.result?"warn":"error");set(root,"[data-kvc-note]",String(error?.message||error))}finally{state.busy=false}
  }

  async function boot(root,core){
    if(!root)return;
    const old=root.__zzxKnotsCoreState;old?.unsubscribe?.();old?.abortController?.abort?.();old?.detachViewport?.();if(old?.searchTimer)W.clearTimeout(old.searchTimer);
    const abortController=typeof AbortController==="function"?new AbortController():null;const options=abortController?{signal:abortController.signal}:undefined;
    const state={core:core||W.ZZXWidgetsCore||null,result:null,busy:false,unsubscribe:null,abortController,searchTimer:null,detachViewport:null};root.__zzxKnotsCoreState=state;
    try{
      await ensureModules(state.core);
      state.detachViewport=W.ZZXKnotsCoreViewport.attach(root);
      q(root,"[data-kvc-refresh]")?.addEventListener("click",()=>refresh(root,state,true),options);
      for(const selector of ["[data-kvc-client]","[data-kvc-sort]"]){q(root,selector)?.addEventListener("change",()=>renderVersions(root,state),options)}
      q(root,"[data-kvc-search]")?.addEventListener("input",()=>{if(state.searchTimer)W.clearTimeout(state.searchTimer);state.searchTimer=W.setTimeout(()=>renderVersions(root,state),100)},options);
      state.unsubscribe=W.ZZXBitnodes.subscribe(detail=>{if(!detail?.snapshot||!root.isConnected)return;refresh(root,state,false)},{immediate:false});
      await refresh(root,state,false);
    }catch(error){status(root,"offline","error");set(root,"[data-kvc-note]",String(error?.message||error))}
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
