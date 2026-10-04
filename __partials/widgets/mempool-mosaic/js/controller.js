(function(){
  "use strict";
  const W=window,D=document,ID="mempool-mosaic";
  if(W.ZZXMempoolMosaicController?.__version>=6)return;

  const q=(root,sel)=>root?.querySelector?.(sel)||null;
  const set=(root,sel,value)=>{const el=q(root,sel);if(el)el.textContent=value==null?"—":String(value)};
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const int=v=>Number.isFinite(finite(v))?Math.round(finite(v)).toLocaleString():"—";
  const num=(v,d=2)=>Number.isFinite(finite(v))?finite(v).toLocaleString(undefined,{maximumFractionDigits:d}):"—";
  const btcFromSats=v=>Number.isFinite(finite(v))?`${(finite(v)/1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC`:"—";
  const usd=v=>Number.isFinite(finite(v))?finite(v).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}):"—";
  function status(root,label,state){const el=q(root,"[data-mm-status]");if(!el)return;el.textContent=label;el.setAttribute("data-status",state||"offline")}

  function positionTip(root,event){
    const block=q(root,"[data-mm-block]"),tip=q(root,"[data-mm-tooltip]");if(!block||!tip)return;
    const r=block.getBoundingClientRect();const x=event?event.clientX-r.left+12:12,y=event?event.clientY-r.top+12:12;
    const width=Math.max(140,Math.min(340,r.width*.88));tip.style.left=`${Math.max(6,Math.min(r.width-width-6,x))}px`;tip.style.top=`${Math.max(6,Math.min(r.height-96,y))}px`;
  }

  function hideTip(root,state){if(state.locked)return;const tip=q(root,"[data-mm-tooltip]");if(tip)tip.hidden=true}
  function restoreLocked(root,state){
    if(!state.locked)return hideTip(root,state);
    const tip=q(root,"[data-mm-tooltip]");if(!tip)return;
    if(state.selectedAnalysis)W.ZZXMempoolMosaicInspector.analysis(tip,state.selectedAnalysis);
    else if(state.selectedItem)W.ZZXMempoolMosaicInspector.tile(tip,state.selectedItem);
    positionTip(root,null);
  }

  function renderSummary(root,state){
    const m=state.model,l=state.layout;if(!m)return;
    set(root,"[data-mm-height]",Number.isFinite(m.nextHeight)?`#${int(m.nextHeight)}`:"next block");
    set(root,"[data-mm-sub]",m.items.length?`${int(m.items.length)} projected TXs · ${num(m.candidateVbytes/1e6,3)} vMB · ${m.sourceMode}`:"waiting for projected-block transaction stream…");
    set(root,"[data-mm-vsize]",Number.isFinite(m.candidateVbytes)?`${num(m.candidateVbytes/1e6,3)} vMB`:"—");
    set(root,"[data-mm-tx]",int(m.items.length));
    set(root,"[data-mm-fees]",`${btcFromSats(m.totalFeesSats)}${Number.isFinite(m.totalFeesUSD)?` · ${usd(m.totalFeesUSD)}`:""}`);
    set(root,"[data-mm-median]",Number.isFinite(m.medianFee)?`${num(m.medianFee,1)} sat/vB`:"—");
    set(root,"[data-mm-tip]",Number.isFinite(m.tipHeight)?`#${int(m.tipHeight)} → candidate #${int(m.nextHeight)}`:"—");
    set(root,"[data-mm-range]",Number.isFinite(m.feeMin)&&Number.isFinite(m.feeMax)?`${num(m.feeMin,1)}–${num(m.feeMax,1)} sat/vB`:"—");
    set(root,"[data-mm-backlog]",Number.isFinite(m.backlogVMB)?`${num(m.backlogVMB,2)} vMB · ${int(m.mempoolTx)} TXs`:"—");
    set(root,"[data-mm-transport]",m.items.length?`${m.liveConnected?"WebSocket live":"real REST/full-feed fallback"} · ${m.transport}`:"waiting for real transaction membership");
    set(root,"[data-mm-source]",m.wsUrl||m.source||"configured mempool source");
    set(root,"[data-mm-updated]",`updated ${new Date(m.fetchedAt).toLocaleTimeString()}`);
    if(l){
      set(root,"[data-mm-block-label]",`${int(l.sourceCount)} real TX · ${int(l.leafCount)} square mosaic cells · ${(l.coverage*100).toFixed(1)}% cover · ${l.mode}`);
      set(root,"[data-mm-meta]",`projected block 0 · recursive square tessellation · ${l.fragmentCount?`${int(l.fragmentCount)} linked fragment cells · `:""}${l.mode} shuffle mode`);
    }else{
      set(root,"[data-mm-block-label]","transaction mosaic");
      set(root,"[data-mm-meta]","waiting for real projected-block transaction rows; no aggregate fake tiles");
    }
    if(m.liveConnected)status(root,"live ws","ok");
    else if(m.items.length)status(root,"fallback","warn");
    else status(root,state.liveState==="error"?"socket fallback":"connecting",state.liveState==="error"?"warn":"offline");
  }

  function redraw(root,state,animate=false){
    const canvas=q(root,"[data-mm-canvas]");if(!canvas||!state.layout||!state.model)return;
    W.ZZXMempoolMosaicRenderer.draw(canvas,state.layout,state.model,{animate,selectedTxid:state.selectedTxid,hoverTxid:state.hoverTxid});
  }

  function rebuild(root,state,{animate=true,reason="data"}={}){
    state.model=W.ZZXMempoolMosaicModel.build({rest:state.rest,live:state.live,enriched:state.enriched});
    if(state.model.items.length){
      state.seed=(state.seed+1)>>>0;
      state.layout=W.ZZXMempoolMosaicLayout.build(state.model.items,{mode:state.mode,seed:state.seed});
      redraw(root,state,animate);
    }else state.layout=null;
    renderSummary(root,state);
    if(state.locked)restoreLocked(root,state);
  }

  function scheduleRebuild(root,state,animate=true){
    W.clearTimeout(state.renderTimer);state.renderTimer=W.setTimeout(()=>{state.renderTimer=0;if(root.isConnected)rebuild(root,state,{animate})},state.cfg.renderDebounceMs);
  }

  async function refresh(root,state,force=false){
    if(state.refreshing)return;state.refreshing=true;
    if(!state.model?.items?.length)status(root,"refreshing","warn");
    try{
      const rest=await W.ZZXMempoolMosaicProvider.load(state.core,{signal:state.abort?.signal,force});
      state.rest=rest;scheduleRebuild(root,state,false);
      if(force){state.liveEngine?.stop?.();startLive(root,state)}
    }catch(error){
      if(error?.name!=="AbortError"){
        state.lastError=String(error?.message||error);if(!state.model?.items?.length)status(root,"offline","error");set(root,"[data-mm-meta]",state.model?.items?.length?`REST refresh failed · ${state.lastError}`:state.lastError);
      }
    }finally{state.refreshing=false}
  }

  function startLive(root,state){
    const cfg=state.cfg;
    state.liveEngine=new W.ZZXMempoolMosaicLive.LiveNextBlock({
      urls:cfg.websocketUrls,reconnectMaxMs:cfg.reconnectMaxMs,
      onUpdate:snapshot=>{if(!root.isConnected)return;state.live=snapshot;scheduleRebuild(root,state,true)},
      onState:event=>{if(!root.isConnected)return;state.liveState=event.state;if(event.state==="live")status(root,"live ws","ok");else if(!state.model?.items?.length&&event.state==="connecting")status(root,"connecting","offline");else if(event.state==="error"&&!state.model?.items?.length)status(root,"socket fallback","warn")}
    });
    state.liveEngine.start();
  }

  function cycleMode(root,state){
    if(!state.model?.items?.length)return;
    const modes=W.ZZXMempoolMosaicSorter.modes;state.modeIndex=(state.modeIndex+1)%modes.length;state.mode=modes[state.modeIndex];state.seed=(state.seed+0x9e3779b9)>>>0;
    state.layout=W.ZZXMempoolMosaicLayout.build(state.model.items,{mode:state.mode,seed:state.seed});
    redraw(root,state,true);renderSummary(root,state);
  }

  async function inspectHit(root,state,item,event){
    if(!item?.txid)return;
    const txid=String(item.txid);state.selectedTxid=txid;state.selectedItem=item;state.selectedAnalysis=null;state.locked=true;
    const tip=q(root,"[data-mm-tooltip]");if(!tip)return;
    W.ZZXMempoolMosaicInspector.loading(tip,item);positionTip(root,event);redraw(root,state,false);
    try{await W.ZZXMempoolMosaicReaderStore.pin(txid,item)}catch(_){}
    const cached=await W.ZZXMempoolMosaicReaderStore.get(txid).catch(()=>null);
    if(cached?.status==="ready"&&cached.analysis){state.selectedAnalysis=cached.analysis;W.ZZXMempoolMosaicInspector.analysis(tip,cached.analysis);positionTip(root,event)}
    try{
      const analysis=await W.ZZXMempoolMosaicTxFetcher.inspect(state.core,txid,{signal:state.abort?.signal,entry:item,tipHeight:state.model?.tipHeight,btcUsd:state.model?.priceUsd});
      state.selectedAnalysis=analysis;state.enriched.set(txid,{...(item||{}),...(analysis.raw||{}),txid,valueSats:analysis.valueSats,vsize:analysis.vsize,fee:analysis.feeSats,feeRate:analysis.feeRate});
      await W.ZZXMempoolMosaicReaderStore.save(analysis,item).catch(()=>null);
      if(state.selectedTxid===txid){W.ZZXMempoolMosaicInspector.analysis(tip,analysis);positionTip(root,event)}
    }catch(error){
      if(error?.name==="AbortError")return;await W.ZZXMempoolMosaicReaderStore.fail(txid,error).catch(()=>null);if(state.selectedTxid===txid){W.ZZXMempoolMosaicInspector.error(tip,txid,error);positionTip(root,event)}
    }
  }

  function attachInteractions(root,state){
    const canvas=q(root,"[data-mm-canvas]");if(!canvas)return;
    const opts=state.abort?{signal:state.abort.signal}:undefined;
    canvas.addEventListener("pointermove",event=>{
      if(!state.layout)return;const hit=W.ZZXMempoolMosaicRenderer.hitTest(canvas,state.layout,event.clientX,event.clientY);state.hoverTxid=hit?.txid||"";canvas.style.cursor=hit?.txid?"pointer":"default";redraw(root,state,false);
      const tip=q(root,"[data-mm-tooltip]");
      if(hit?.txid){W.ZZXMempoolMosaicInspector.tile(tip,hit);positionTip(root,event)}else if(state.locked)restoreLocked(root,state);else hideTip(root,state);
    },opts);
    canvas.addEventListener("pointerleave",()=>{state.hoverTxid="";canvas.style.cursor="default";redraw(root,state,false);if(state.locked)restoreLocked(root,state);else hideTip(root,state)},opts);
    canvas.addEventListener("click",event=>{
      if(!state.layout)return;const hit=W.ZZXMempoolMosaicRenderer.hitTest(canvas,state.layout,event.clientX,event.clientY);
      if(hit?.txid)inspectHit(root,state,hit,event);else{state.locked=false;state.selectedTxid="";state.selectedItem=null;state.selectedAnalysis=null;hideTip(root,state);redraw(root,state,false)}
    },opts);
    q(root,"[data-mm-refresh]")?.addEventListener("click",()=>refresh(root,state,true),opts);
  }

  function teardown(root){
    const old=root.__zzxMempoolMosaicState;if(!old)return;
    W.clearTimeout(old.renderTimer);W.clearInterval(old.refreshInterval);W.clearInterval(old.shuffleInterval);old.liveEngine?.stop?.();old.resize?.disconnect?.();old.abort?.abort?.();const canvas=q(root,"[data-mm-canvas]");if(canvas)W.ZZXMempoolMosaicRenderer?.reset?.(canvas);
  }

  async function boot(root,core){
    if(!root)return;teardown(root);
    const abort=typeof AbortController==="function"?new AbortController():null;const actualCore=core||W.ZZXWidgetsCore||null;const cfg=W.ZZXMempoolMosaicSources.get(actualCore);
    const state={core:actualCore,cfg,rest:{cfg,source:cfg.apiBase,fetchedAt:Date.now()},live:null,enriched:new Map(),model:null,layout:null,mode:"mosaic",modeIndex:0,seed:(Date.now()>>>0),hoverTxid:"",selectedTxid:"",selectedItem:null,selectedAnalysis:null,locked:false,liveState:"connecting",refreshing:false,renderTimer:0,refreshInterval:0,shuffleInterval:0,resize:null,abort,liveEngine:null};
    root.__zzxMempoolMosaicState=state;status(root,"connecting","offline");attachInteractions(root,state);startLive(root,state);
    if("ResizeObserver" in W){state.resize=new ResizeObserver(()=>W.requestAnimationFrame(()=>{if(state.layout)redraw(root,state,false)}));const block=q(root,"[data-mm-block]");if(block)state.resize.observe(block)}
    state.refreshInterval=W.setInterval(()=>refresh(root,state,false),cfg.refreshMs);
    state.shuffleInterval=W.setInterval(()=>cycleMode(root,state),cfg.shuffleMs);
    refresh(root,state,false);
  }

  W.ZZXMempoolMosaicController=Object.freeze({__version:6,boot,teardown,rebuild,refresh});
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
