(function(){
  "use strict";
  const W=window,D=document,ID="mempool-mosaic";

  function q(root,sel){return root?.querySelector?.(sel)||null;}
  function set(root,sel,v){const el=q(root,sel);if(el)el.textContent=v==null?"—":String(v);}
  function int(v){const n=Number(v);return Number.isFinite(n)?Math.round(n).toLocaleString():"—";}
  function num(v,d=2){const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:d}):"—";}
  function btc(v){const n=Number(v);return Number.isFinite(n)?`${n.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`:"—";}
  function usd(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2}):"—";}
  function status(root,label,state){const el=q(root,"[data-mm-status]");if(!el)return;el.textContent=label;el.setAttribute("data-status",state||"offline");}
  function resolve(path){return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;}
  function base(core){return core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/mempool-mosaic";}

  async function loadScript(path,test,tag){
    if(test())return;
    const src=new URL(resolve(path),W.location.href).href;
    const existing=[...D.scripts].find(s=>s.src===src);
    if(existing){const start=Date.now();while(!test()&&Date.now()-start<1800)await new Promise(done=>W.setTimeout(done,25));if(test())return;}
    await new Promise((done,fail)=>{const s=D.createElement("script");s.src=src;s.defer=true;s.dataset.mmDependency=tag;s.addEventListener("load",done,{once:true});s.addEventListener("error",fail,{once:true});(D.head||D.documentElement).appendChild(s);});
    if(!test())throw new Error(`${path} did not register ${tag}`);
  }

  async function ensureModules(core){
    await loadScript("/__partials/widgets/_shared/zzx-mempool-live.js",()=>Number(W.ZZXMempoolLive?.__version||0)>=2,"ZZXMempoolLive");
    for(const [globalName,relative,version] of [
      ["ZZXMempoolMosaicSources","js/sources.js",2],
      ["ZZXMempoolMosaicFetch","js/fetch.js",2],
      ["ZZXMempoolMosaicProvider","js/provider.js",2],
      ["ZZXMempoolMosaicModel","js/model.js",2],
      ["ZZXMempoolMosaicTreemap","js/treemap.js",2],
      ["ZZXMempoolMosaicRenderer","js/renderer.js",2]
    ])await loadScript(`${base(core)}/${relative}`,()=>Number(W[globalName]?.__version||0)>=version,globalName);
  }

  function tooltipText(root,item){
    const tip=q(root,"[data-mm-tooltip]");if(!tip)return;tip.replaceChildren();
    const title=D.createElement("strong");title.textContent=item.txid?`${String(item.txid).slice(0,16)}…`:`${item.kind}`;
    const lines=[];
    lines.push(`${num(item.feeRate,2)} sat/vB · ${int(item.vbytes)} vB`);
    if(Number.isFinite(Number(item.fee)))lines.push(`${int(item.fee)} sats fee`);
    if(Number.isFinite(Number(item.value)))lines.push(`${int(item.value)} sats output value`);
    if(item.kind==="aggregate-overflow")lines.push(`${int(item.count)} transactions coalesced`);
    const body=D.createElement("span");body.textContent=lines.join(" · ");tip.append(title,body);
  }

  function placeTooltip(root,event,hit){
    const block=q(root,"[data-mm-block]"),tip=q(root,"[data-mm-tooltip]");if(!block||!tip)return;
    const rect=block.getBoundingClientRect();tooltipText(root,hit.item);tip.hidden=false;
    tip.style.left=`${Math.max(6,Math.min(rect.width-250,event.clientX-rect.left+12))}px`;
    tip.style.top=`${Math.max(6,Math.min(rect.height-78,event.clientY-rect.top+12))}px`;
  }
  function hideTooltip(root){const tip=q(root,"[data-mm-tooltip]");if(tip)tip.hidden=true;}

  function draw(root,state,animate=true){
    if(!state.model)return;
    const canvas=q(root,"[data-mm-canvas]");
    state.hits=W.ZZXMempoolMosaicRenderer.draw(canvas,state.model.tiles,state.model,{animate});
  }

  function render(root,state){
    const m=state.model;if(!m)return;
    set(root,"[data-mm-height]",Number.isFinite(m.nextHeight)?`#${int(m.nextHeight)}`:"next block");
    set(root,"[data-mm-sub]",`${int(m.candidateTx)} candidate TXs · ${num(m.candidateVbytes/1e6,3)} vMB · ${m.bandMethod}`);
    set(root,"[data-mm-vsize]",Number.isFinite(m.candidateVbytes)?`${num(m.candidateVbytes/1e6,3)} vMB`:"—");
    set(root,"[data-mm-tx]",int(m.candidateTx));
    set(root,"[data-mm-fees]",`${btc(m.totalFeesBTC)}${Number.isFinite(m.totalFeesUSD)?` · ${usd(m.totalFeesUSD)}`:""}`);
    set(root,"[data-mm-median]",Number.isFinite(m.medianFee)?`${num(m.medianFee,1)} sat/vB`:"—");
    set(root,"[data-mm-tip]",Number.isFinite(m.tipHeight)?`#${int(m.tipHeight)} → candidate #${int(m.nextHeight)}`:"—");
    set(root,"[data-mm-range]",Number.isFinite(m.feeMin)&&Number.isFinite(m.feeMax)?`${num(m.feeMin,1)}–${num(m.feeMax,1)} sat/vB`:"—");
    set(root,"[data-mm-backlog]",Number.isFinite(m.backlogVMB)?`${num(m.backlogVMB,2)} vMB · ${int(m.mempoolTx)} TXs`:"—");
    set(root,"[data-mm-transport]",`${m.liveConnected?"WebSocket live":"REST/poll fallback"}${m.transport?` · ${m.transport}`:""}`);
    set(root,"[data-mm-source]",m.wsUrl||m.source||"configured mempool source");
    set(root,"[data-mm-updated]",`updated ${new Date(m.fetchedAt).toLocaleTimeString()}`);
    set(root,"[data-mm-block-label]",m.mode==="transactions"?`${m.realTransactionTiles.toLocaleString()} stable transaction tiles · projected block 0`:`${m.tiles.length.toLocaleString()} aggregate fallback tiles`);
    set(root,"[data-mm-meta]",m.mode==="transactions"?"real projected-block transaction rows · txid-stable animated layout · tiles slide as ordering changes":"transaction-level stream not present · deterministic aggregate fee-band fallback; no fake txids");
    draw(root,state,true);
    status(root,m.liveConnected?"live ws":m.mode==="transactions"?"live data":"fallback",m.liveConnected?"ok":"warn");
  }

  function consume(root,state,payload){
    try{
      const next=W.ZZXMempoolMosaicModel.build(payload);
      if(!next.tiles.length)return;
      state.model=next;render(root,state);
    }catch(error){set(root,"[data-mm-meta]",String(error?.message||error));}
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{const payload=await W.ZZXMempoolMosaicProvider.load(state.core,force);consume(root,state,payload);if(force)W.ZZXMempoolMosaicProvider.reconnect(state.core);}catch(error){status(root,state.model?"stale":"offline",state.model?"warn":"error");set(root,"[data-mm-meta]",String(error?.message||error));}finally{state.busy=false;}
  }

  async function boot(root,core){
    if(!root)return;
    const old=root.__zzxMempoolMosaicState;old?.unsubscribe?.();old?.resize?.disconnect?.();old?.abortController?.abort?.();
    const abortController=typeof AbortController==="function"?new AbortController():null;const opts=abortController?{signal:abortController.signal}:undefined;
    const state={core:core||W.ZZXWidgetsCore||null,model:null,hits:[],busy:false,unsubscribe:null,resize:null,abortController};root.__zzxMempoolMosaicState=state;
    try{
      await ensureModules(state.core);
      const canvas=q(root,"[data-mm-canvas]");
      canvas?.addEventListener("pointermove",event=>{const rect=canvas.getBoundingClientRect();const hit=W.ZZXMempoolMosaicRenderer.hitTest(state.hits,event.clientX-rect.left,event.clientY-rect.top);if(hit){canvas.style.cursor="crosshair";placeTooltip(root,event,hit);}else{canvas.style.cursor="default";hideTooltip(root);}},opts);
      canvas?.addEventListener("pointerleave",()=>{canvas.style.cursor="default";hideTooltip(root);},opts);
      q(root,"[data-mm-refresh]")?.addEventListener("click",()=>refresh(root,state,true),opts);
      if("ResizeObserver" in W){state.resize=new ResizeObserver(()=>W.requestAnimationFrame(()=>{if(state.model)draw(root,state,false);}));state.resize.observe(q(root,"[data-mm-block]"));}
      state.unsubscribe=W.ZZXMempoolMosaicProvider.subscribe(state.core,payload=>{if(root.isConnected)consume(root,state,payload);},{immediate:true});
      await refresh(root,state,false);
    }catch(error){status(root,"offline","error");set(root,"[data-mm-meta]",String(error?.message||error));}
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
