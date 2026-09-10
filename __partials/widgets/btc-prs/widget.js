// __partials/widgets/btc-prs/widget.js
(function(){
  "use strict";
  const W=window,D=document,ID="btc-prs";
  function q(r,s){return r?.querySelector?.(s)||null}
  function set(r,s,v){const e=q(r,s);if(e)e.textContent=v==null?"—":String(v)}
  function status(r,l,s){const e=q(r,"[data-btc-prs-status]");if(e){e.textContent=l;e.dataset.status=s}}
  function base(core){return core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/,""):"/__partials/widgets/btc-prs"}
  async function loadScript(path,test){
    if(test())return;
    const src=new URL(path,location.href).href;
    const existing=[...D.scripts].find(s=>s.src===src);
    if(existing){const start=Date.now();while(!test()&&Date.now()-start<2500)await new Promise(r=>setTimeout(r,25));if(test())return}
    await new Promise((ok,fail)=>{const s=D.createElement("script");s.src=src;s.defer=true;s.onload=ok;s.onerror=()=>fail(new Error(`Failed ${path}`));(D.head||D.documentElement).appendChild(s)});
    if(!test())throw new Error(`Module failed: ${path}`)
  }
  async function ensure(core){
    await loadScript(`${base(core)}/js/model.js`,()=>Number(W.ZZXBitcoinPRModel?.__version||0)>=1);
    await loadScript(`${base(core)}/js/provider.js`,()=>Number(W.ZZXBitcoinPRProvider?.__version||0)>=1);
    await loadScript(`${base(core)}/js/ui.js`,()=>Number(W.ZZXBitcoinPRUI?.__version||0)>=1);
  }
  function filtered(root,state){
    let rows=[...(state.model?.rows||[])];
    const filter=q(root,"[data-btc-prs-filter]")?.value||"all";
    const needle=(q(root,"[data-btc-prs-search]")?.value||"").trim().toLowerCase();
    if(filter!=="all")rows=rows.filter(r=>r.state===filter);
    if(needle)rows=rows.filter(r=>[r.number,r.title,r.author,r.base,r.head].join(" ").toLowerCase().includes(needle));
    return rows
  }
  function renderList(root,state,reset=false){
    const rows=filtered(root,state);
    W.ZZXBitcoinPRUI.render(q(root,"[data-btc-prs-list]"),rows);
    set(root,"[data-btc-prs-visible]",`${rows.length} visible / ${state.model.rows.length} recent`);
    if(reset){const s=q(root,"[data-btc-prs-scroll]");if(s)s.scrollTop=0}
  }
  function render(root,state){
    const c=state.model.counts;
    set(root,"[data-btc-prs-open]",c.open);
    set(root,"[data-btc-prs-merged]",c.merged);
    set(root,"[data-btc-prs-closed]",c.closed);
    set(root,"[data-btc-prs-24h]",c.updated24h);
    set(root,"[data-btc-prs-source]",`${state.detail.source} · ${state.detail.transport}${state.detail.stale?" · stale":""}`);
    renderList(root,state);
    status(root,state.detail.stale?"cached":"live",state.detail.stale?"warn":"ok");
    W.ZZXBitcoinPRsLatest=Object.freeze({
      schema:"zzx-bitcoin-core-pr-export-v1",
      rows:state.model.rows,
      counts:state.model.counts,
      source:state.detail.source,
      stale:!!state.detail.stale
    });
  }
  async function refresh(root,state,force=false){
    if(state.busy)return;state.busy=true;status(root,"refreshing","warn");
    state.controller?.abort?.();state.controller=typeof AbortController==="function"?new AbortController():null;
    try{
      state.detail=await W.ZZXBitcoinPRProvider.load({force,signal:state.controller?.signal||null});
      state.model=W.ZZXBitcoinPRModel.build(state.detail.rows);
      render(root,state);
    }catch(e){
      if(e?.name!=="AbortError"){status(root,state.model?"stale":"offline",state.model?"warn":"error");set(root,"[data-btc-prs-source]",e?.message||e)}
    }finally{state.busy=false}
  }
  async function boot(root,core){
    const old=root.__zzxBitcoinPRState;old?.abortController?.abort?.();old?.controller?.abort?.();if(old?.timer)clearTimeout(old.timer);
    const ac=typeof AbortController==="function"?new AbortController():null,opts=ac?{signal:ac.signal}:undefined;
    const state={detail:null,model:null,busy:false,timer:null,abortController:ac,controller:null};root.__zzxBitcoinPRState=state;
    try{
      await ensure(core);
      q(root,"[data-btc-prs-search]")?.addEventListener("input",()=>{if(state.timer)clearTimeout(state.timer);state.timer=setTimeout(()=>renderList(root,state,true),100)},opts);
      q(root,"[data-btc-prs-filter]")?.addEventListener("change",()=>renderList(root,state,true),opts);
      q(root,"[data-btc-prs-refresh]")?.addEventListener("click",()=>refresh(root,state,true),opts);
      await refresh(root,state,false);
    }catch(e){status(root,"offline","error");set(root,"[data-btc-prs-source]",e?.message||e)}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
