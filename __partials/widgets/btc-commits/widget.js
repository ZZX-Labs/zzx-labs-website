// __partials/widgets/btc-commits/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="btc-commits";

  function q(root,selector){return root?.querySelector?.(selector)||null}
  function set(root,selector,value){const el=q(root,selector);if(el)el.textContent=value==null?"—":String(value)}
  function status(root,label,state){const el=q(root,"[data-btc-commits-status]");if(el){el.textContent=label;el.dataset.status=state}}

  function base(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/,"")
      : "/__partials/widgets/btc-commits";
  }

  async function loadScript(path,test){
    if(test())return;
    const src=new URL(path,location.href).href;
    const existing=[...D.scripts].find(s=>s.src===src);

    if(existing){
      const start=Date.now();
      while(!test()&&Date.now()-start<2500)await new Promise(r=>setTimeout(r,25));
      if(test())return;
    }

    await new Promise((ok,fail)=>{
      const s=D.createElement("script");
      s.src=src;
      s.defer=true;
      s.onload=ok;
      s.onerror=()=>fail(new Error(`Failed ${path}`));
      (D.head||D.documentElement).appendChild(s);
    });

    if(!test())throw new Error(`Module failed: ${path}`);
  }

  async function ensure(core){
    await loadScript(`${base(core)}/js/model.js`,()=>Number(W.ZZXBitcoinCommitModel?.__version||0)>=1);
    await loadScript(`${base(core)}/js/provider.js`,()=>Number(W.ZZXBitcoinCommitProvider?.__version||0)>=2);
    await loadScript(`${base(core)}/js/ui.js`,()=>Number(W.ZZXBitcoinCommitUI?.__version||0)>=1);
  }

  function filtered(root,state){
    const needle=(q(root,"[data-btc-commits-search]")?.value||"").trim().toLowerCase();
    if(!needle)return [...state.model.rows];
    return state.model.rows.filter(row=>
      [row.sha,row.message,row.author].join(" ").toLowerCase().includes(needle)
    );
  }

  function renderList(root,state,reset=false){
    const rows=filtered(root,state);
    W.ZZXBitcoinCommitUI.render(q(root,"[data-btc-commits-list]"),rows);
    set(root,"[data-btc-commits-visible]",`${rows.length} visible / ${state.model.rows.length} recent`);
    if(reset){
      const scroller=q(root,"[data-btc-commits-scroll]");
      if(scroller)scroller.scrollTop=0;
    }
  }

  function render(root,state){
    const m=state.model;
    set(root,"[data-btc-commits-24h]",m.counts.h24);
    set(root,"[data-btc-commits-7d]",m.counts.d7);
    set(root,"[data-btc-commits-authors]",m.counts.authors);
    set(root,"[data-btc-commits-size]",m.counts.size);

    if(m.latest){
      set(root,"[data-btc-commits-latest-title]",m.latest.message||m.latest.shortSha);
      set(root,"[data-btc-commits-latest-meta]",`${m.latest.shortSha} · ${m.latest.author} · ${new Date(m.latest.date).toLocaleString()}`);
      const link=q(root,"[data-btc-commits-latest-link]");
      if(link)link.href=m.latest.url||"#";
    }

    set(root,"[data-btc-commits-source]",`${state.detail.source} · ${state.detail.transport}${state.detail.stale?" · stale":""}`);
    renderList(root,state);
    status(root,state.detail.stale?"cached":"live",state.detail.stale?"warn":"ok");

    W.ZZXBitcoinCommitsLatest=Object.freeze({
      schema:"zzx-bitcoin-core-commits-export-v1",
      rows:m.rows,
      counts:m.counts,
      source:state.detail.source,
      stale:!!state.detail.stale
    });
  }

  async function refresh(root,state,force=false){
    if(state.busy)return;
    state.busy=true;
    status(root,"refreshing","warn");

    state.controller?.abort?.();
    state.controller=typeof AbortController==="function"?new AbortController():null;

    try{
      state.detail=await W.ZZXBitcoinCommitProvider.load({
        force,
        signal:state.controller?.signal||null
      });
      state.model=W.ZZXBitcoinCommitModel.build(state.detail.rows);
      render(root,state);
    }catch(error){
      if(error?.name!=="AbortError"){
        status(root,state.model?"stale":"offline",state.model?"warn":"error");
        set(root,"[data-btc-commits-source]",error?.message||error);
      }
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    const old=root.__zzxBitcoinCommitState;
    old?.abortController?.abort?.();
    old?.controller?.abort?.();
    if(old?.timer)clearTimeout(old.timer);

    const ac=typeof AbortController==="function"?new AbortController():null;
    const opts=ac?{signal:ac.signal}:undefined;
    const state={
      detail:null,
      model:null,
      busy:false,
      timer:null,
      controller:null,
      abortController:ac
    };
    root.__zzxBitcoinCommitState=state;

    try{
      await ensure(core);

      q(root,"[data-btc-commits-search]")?.addEventListener("input",()=>{
        if(state.timer)clearTimeout(state.timer);
        state.timer=setTimeout(()=>renderList(root,state,true),100);
      },opts);

      q(root,"[data-btc-commits-refresh]")?.addEventListener("click",()=>refresh(root,state,true),opts);
      await refresh(root,state,false);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-btc-commits-source]",error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
