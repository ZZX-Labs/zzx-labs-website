// __partials/widgets/global-power-grid/widget.js
(function(){
  "use strict";
  const W=window,D=document,ID="global-power-grid";
  const SORT_KEY="zzx.widget.global-power-grid.sort.v10.35";
  const PERIOD_KEY="zzx.widget.global-power-grid.period.v10.35";
  function q(r,s){return r?.querySelector?.(s)||null}
  function set(r,s,v){const e=q(r,s);if(e)e.textContent=v==null?"—":String(v)}
  function safeGet(k){try{return localStorage.getItem(k)}catch(_){return null}}
  function safeSet(k,v){try{localStorage.setItem(k,String(v))}catch(_){}}
  function status(r,l,s){const e=q(r,"[data-gpg-status]");if(e){e.textContent=l;e.dataset.status=s}}
  function base(core){return core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/,""):"/__partials/widgets/global-power-grid"}
  function resolve(p){return W.ZZXAPI?.url?W.ZZXAPI.url(p):p}
  async function loadScript(path,test,tag){
    if(test())return;const src=new URL(resolve(path),location.href).href;
    const existing=[...D.scripts].find(s=>s.src===src);
    if(existing){const start=Date.now();while(!test()&&Date.now()-start<2500)await new Promise(r=>setTimeout(r,25));if(test())return}
    await new Promise((ok,fail)=>{const s=D.createElement("script");s.src=src;s.defer=true;s.onload=ok;s.onerror=()=>fail(new Error(`Failed ${path}`));(D.head||D.documentElement).appendChild(s)});
    if(!test())throw new Error(`${tag} failed to register`)
  }
  async function ensure(core){
    await loadScript(`${base(core)}/js/model.js`,()=>Number(W.ZZXGlobalPowerGridModel?.__version||0)>=1,"model");
    await loadScript(`${base(core)}/js/provider.js`,()=>Number(W.ZZXGlobalPowerGridProvider?.__version||0)>=2,"provider");
    await loadScript(`${base(core)}/js/ui.js`,()=>Number(W.ZZXGlobalPowerGridUI?.__version||0)>=1,"ui");
    await loadScript(`${base(core)}/js/charts.js`,()=>Number(W.ZZXGlobalPowerGridCharts?.__version||0)>=1,"charts");
    await loadScript(`${base(core)}/js/viewport.js`,()=>Number(W.ZZXGlobalPowerGridViewport?.__version||0)>=1,"viewport");
  }
  function period(root){return q(root,"[data-gpg-period]")?.value||"day"}
  function filtered(root,state){
    let rows=[...(state.model?.rows||[])];
    const needle=(q(root,"[data-gpg-search]")?.value||"").trim().toLowerCase();
    if(needle)rows=rows.filter(r=>[r.country,r.countryName,...r.timezones].join(" ").toLowerCase().includes(needle));
    const sort=q(root,"[data-gpg-sort]")?.value||"generation-desc";
    const key={
      "generation-desc":"generationMW","load-desc":"loadMW","capacity-desc":"capacityMW",
      "headroom-desc":"headroomMW","ceiling-desc":"absoluteMiningCeilingEH"
    }[sort];
    if(sort==="nation")rows.sort((a,b)=>a.countryName.localeCompare(b.countryName));
    else rows.sort((a,b)=>{
      const av=Number.isFinite(a[key])?a[key]:-Infinity,bv=Number.isFinite(b[key])?b[key]:-Infinity;
      return bv-av||a.countryName.localeCompare(b.countryName)
    });
    return rows
  }
  function renderTable(root,state,reset=false){
    const rows=filtered(root,state),tbody=q(root,"[data-gpg-body]");
    W.ZZXGlobalPowerGridUI.renderRows(tbody,rows,period(root),W.ZZXGlobalPowerGridModel);
    set(root,"[data-gpg-visible-count]",`${rows.length} visible / ${state.model.rows.length} ISO countries`);
    if(reset){const s=q(root,"[data-gpg-scroll]");if(s)s.scrollTop=0}
  }
  function render(root,state){
    const m=state.model,ui=W.ZZXGlobalPowerGridUI;
    set(root,"[data-gpg-global-load]",ui.fmtPower(m.global.loadMW));
    set(root,"[data-gpg-global-generation]",`generation ${ui.fmtPower(m.global.generationMW)}`);
    set(root,"[data-gpg-country-count]",`${m.availableCount} / ${m.registryCount}`);
    set(root,"[data-gpg-peak]",ui.fmtPower(m.global.peakMW));
    set(root,"[data-gpg-low]",ui.fmtPower(m.global.lowCountryLoadMW));
    set(root,"[data-gpg-coverage]",`${(m.coverage*100).toFixed(1)}%`);
    set(root,"[data-gpg-mix-total]",`${m.mix.length} generation sources`);
    set(root,"[data-gpg-timezone-count]",`${m.timezones.length} zones`);
    W.ZZXGlobalPowerGridCharts.renderProfile(root,m.profile);
    W.ZZXGlobalPowerGridCharts.renderTimezones(root,m.timezones);
    ui.renderMix(q(root,"[data-gpg-mix]"),m.mix);
    renderTable(root,state);
    const src=state.detail.source||{};
    set(root,"[data-gpg-sub]",`CIA historical ${src.factbook||"unavailable"} · live grid ${src.live||"unavailable"} · ${m.availableCount}/${m.registryCount} countries currently have verified electricity observations`);
    status(root,state.detail.stale?"cached":"live",state.detail.stale?"warn":"ok");
    W.ZZXGlobalPowerGridLatest=Object.freeze({
      schema:"zzx-global-power-grid-export-v1",
      nations:m.rows,
      global:m.global,
      mix:m.mix,
      profile:m.profile,
      timezones:m.timezones,
      coverage:m.coverage,
      miningEfficiencyJTH:30,
      source:state.detail.source
    })
  }
  async function refresh(root,state,force=false){
    if(state.busy)return;state.busy=true;status(root,"refreshing","warn");
    state.controller?.abort?.();state.controller=typeof AbortController==="function"?new AbortController():null;
    try{
      state.detail=await W.ZZXGlobalPowerGridProvider.load({force,signal:state.controller?.signal||null});
      state.model=W.ZZXGlobalPowerGridModel.build(state.detail.payload.registry,state.detail.payload.factbook,state.detail.payload.live);
      render(root,state)
    }catch(e){
      if(e?.name!=="AbortError"){status(root,state.model?"stale":"offline",state.model?"warn":"error");set(root,"[data-gpg-sub]",e?.message||e)}
    }finally{state.busy=false}
  }
  async function boot(root,core){
    const old=root.__zzxGlobalPowerGridState;old?.abortController?.abort?.();old?.controller?.abort?.();old?.detachViewport?.();if(old?.timer)clearTimeout(old.timer);
    const ac=typeof AbortController==="function"?new AbortController():null,opts=ac?{signal:ac.signal}:undefined;
    const state={detail:null,model:null,busy:false,timer:null,abortController:ac,controller:null,detachViewport:null};
    root.__zzxGlobalPowerGridState=state;
    try{
      await ensure(core);state.detachViewport=W.ZZXGlobalPowerGridViewport.attach(root);
      const sort=q(root,"[data-gpg-sort]"),per=q(root,"[data-gpg-period]");
      const ss=safeGet(SORT_KEY),sp=safeGet(PERIOD_KEY);
      if(sort&&["generation-desc","load-desc","capacity-desc","headroom-desc","ceiling-desc","nation"].includes(ss))sort.value=ss;
      if(per&&["hour","day","week","month","year"].includes(sp))per.value=sp;
      q(root,"[data-gpg-search]")?.addEventListener("input",()=>{if(state.timer)clearTimeout(state.timer);state.timer=setTimeout(()=>renderTable(root,state,true),100)},opts);
      sort?.addEventListener("change",()=>{safeSet(SORT_KEY,sort.value);renderTable(root,state,true)},opts);
      per?.addEventListener("change",()=>{safeSet(PERIOD_KEY,per.value);renderTable(root,state,true)},opts);
      q(root,"[data-gpg-refresh]")?.addEventListener("click",()=>refresh(root,state,true),opts);
      await refresh(root,state,false)
    }catch(e){status(root,"offline","error");set(root,"[data-gpg-sub]",e?.message||e)}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
